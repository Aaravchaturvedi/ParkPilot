import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import type { Booking } from '../../../../packages/types/src';
import { cancelBooking, listBookings, payBooking } from '../../../../packages/api/src/index';
import { Button, Card, EmptyState, PriceTag, StatusPill } from '../../../../packages/ui/src';
import { getSocket, ensureSocket } from '../../../../packages/mobile/src/socket';

// Customer booking history. This is the safety net that makes tab switching
// safe: even if the Ride tab draft is cleared, every booking survives here
// via REST + live socket updates. Polls + socket so a missed push never
// hides a booking forever.
export function TripsScreen({
  active,
  lastUpdate,
  onTrack,
  apiURL,
  token,
}: {
  active: boolean;
  lastUpdate: number;
  onTrack: (bookingId: string) => void;
  apiURL: string;
  token: string;
}): React.JSX.Element {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false): Promise<void> => {
    if (!silent) setRefreshing(true);
    setError(null);
    try {
      const { bookings: list } = await listBookings();
      setBookings(list);
    } catch {
      if (!silent) setError('Could not load trips — pull to retry.');
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, []);

  // Load on mount + whenever the tab becomes visible + on global updates.
  useEffect(() => {
    void refresh(true);
  }, [refresh]);
  useEffect(() => {
    if (active) void refresh(true);
  }, [active, refresh]);
  useEffect(() => {
    if (lastUpdate > 0) void refresh(true);
  }, [lastUpdate, refresh]);

  // Live status patches for visible bookings without a full refetch.
  // Uses ensureSocket: this screen mounts before the App shell creates the
  // shared connection, so getSocket() alone would be null forever here.
  useEffect(() => {
    const s = getSocket() ?? ensureSocket(apiURL, token);
    const onUpdate = (evt: { booking: Booking }): void => {
      setBookings((list) => {
        if (!list.some((b) => b.id === evt.booking.id)) return [evt.booking, ...list];
        return list.map((b) => (b.id === evt.booking.id ? evt.booking : b));
      });
    };
    s.on('booking:updated', onUpdate);
    s.on('booking:accepted', onUpdate);
    return () => {
      s.off('booking:updated', onUpdate);
      s.off('booking:accepted', onUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiURL, token]);

  // Slow poll as a backstop for missed pushes (10s, only while visible).
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => void refresh(true), 10000);
    return () => clearInterval(t);
  }, [active, refresh]);

  const act = async (id: string, fn: (bid: string) => Promise<{ booking: Booking }>): Promise<void> => {
    setBusyId(id);
    setError(null);
    try {
      const { booking } = await fn(id);
      setBookings((list) => list.map((b) => (b.id === booking.id ? booking : b)));
    } catch {
      setError('Action failed — the trip may have changed. Pulled fresh data.');
      await refresh(true);
    } finally {
      setBusyId(null);
    }
  };

  const live = bookings.filter((b) => b.status === 'REQUESTED' || b.status === 'ACCEPTED' || b.status === 'ONGOING');
  const past = bookings.filter((b) => b.status === 'COMPLETED' || b.status === 'CANCELLED');

  const renderRow = (b: Booking): React.JSX.Element => {
    const canCancel = b.status === 'REQUESTED' || b.status === 'ACCEPTED';
    const canPay = b.paymentStatus === 'PENDING' && (b.status === 'ACCEPTED' || b.status === 'ONGOING' || b.status === 'COMPLETED');
    const canTrack = b.type === 'DRIVER' && (b.status === 'ACCEPTED' || b.status === 'ONGOING');
    const timerLine =
      b.type === 'DRIVER'
        ? `${b.estimatedHours ?? '?'} hr est${b.billedMinutes ? ` · billed ${b.billedMinutes} min` : ''}`
        : null;
    return (
      <Card key={b.id}>
        <StatusPill status={b.status} />
        <Text style={styles.dim}>
          {b.type} · {b.id.slice(0, 8)}
          {timerLine ? ` · ${timerLine}` : ''}
          {b.space ? ` · ${b.space.title}` : ''}
        </Text>
        <PriceTag paise={b.amountPaise} label={b.status === 'COMPLETED' && b.billedMinutes ? `Final (${b.billedMinutes} min)` : 'Fare'} />
        <Text style={styles.dim}>Payment: {b.paymentStatus}</Text>
        <View style={styles.row}>
          {canTrack ? <Button title={b.status === 'ONGOING' ? 'Timer & end trip' : 'Open trip'} onPress={() => onTrack(b.id)} /> : null}
          {canPay ? (
            <Button title={busyId === b.id ? 'Paying…' : 'Pay (mock)'} onPress={() => act(b.id, payBooking)} disabled={busyId === b.id} />
          ) : null}
          {canCancel ? (
            <Button title={busyId === b.id ? '…' : 'Cancel'} onPress={() => act(b.id, cancelBooking)} disabled={busyId === b.id} />
          ) : null}
        </View>
      </Card>
    );
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refresh(false)} />}
    >
      <Text style={styles.title}>My trips ({bookings.length})</Text>
      {live.length === 0 && past.length === 0 ? (
        <EmptyState title="No trips yet" hint="Book a driver by the hour or grab a parking spot — everything lands here." />
      ) : null}
      {live.length > 0 ? <Text style={styles.section}>Active</Text> : null}
      {live.map(renderRow)}
      {past.length > 0 ? <Text style={styles.section}>History</Text> : null}
      {past.map(renderRow)}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  section: { fontSize: 14, fontWeight: '700', color: '#6b7280', marginTop: 8 },
  dim: { color: '#6b7280' },
  row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  error: { color: '#dc2626' },
});
