import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Booking } from '../../../../packages/types/src';
import { cancelBooking, listBookings, payBooking } from '../../../../packages/api/src/index';
import { AppHeader, Button, Card, EmptyState, FadeIn, PriceTag, Screen, SectionLabel, SkeletonBlock, StatusPill } from '../../../../packages/ui/src';
import { getSocket, ensureSocket } from '../../../../packages/mobile/src/socket';

// Customer booking history — the safety net that makes tab switching safe:
// every booking survives here via REST + live socket updates.
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
  const [bookings, setBookings] = useState<Booking[] | null>(null);
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
  useEffect(() => {
    const s = getSocket() ?? ensureSocket(apiURL, token);
    const onUpdate = (evt: { booking: Booking }): void => {
      setBookings((list) => {
        if (!list) return list;
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
      setBookings((list) => (list ? list.map((b) => (b.id === booking.id ? booking : b)) : list));
    } catch {
      setError('Action failed — the trip may have changed. Pulled fresh data.');
      await refresh(true);
    } finally {
      setBusyId(null);
    }
  };

  const list = bookings ?? [];
  const live = list.filter((b) => b.status === 'REQUESTED' || b.status === 'ACCEPTED' || b.status === 'ONGOING');
  const past = list.filter((b) => b.status === 'COMPLETED' || b.status === 'CANCELLED');

  const renderRow = (b: Booking, i: number): React.JSX.Element => {
    const canCancel = b.status === 'REQUESTED' || b.status === 'ACCEPTED';
    const canPay = b.paymentStatus === 'PENDING' && (b.status === 'ACCEPTED' || b.status === 'ONGOING' || b.status === 'COMPLETED');
    const canTrack = b.type === 'DRIVER' && (b.status === 'ACCEPTED' || b.status === 'ONGOING');
    const sub =
      b.type === 'DRIVER'
        ? `${b.estimatedHours ?? '?'} hr est${b.billedMinutes ? ` · billed ${b.billedMinutes} min` : ''} · ${b.paymentStatus.toLowerCase()}`
        : `${b.space?.title ?? 'Parking'} · ${b.paymentStatus.toLowerCase()}`;
    return (
      <FadeIn key={b.id} delay={Math.min(i, 6) * 50}>
        <Card style={styles.rowCard}>
          <View style={styles.rowHead}>
            <Text style={styles.rowTitle}>{b.type === 'DRIVER' ? 'Driver hire' : 'Parking'}</Text>
            <StatusPill status={b.status} />
          </View>
          <Text style={styles.dim}>{sub}</Text>
          <View style={styles.rowFoot}>
            <PriceTag paise={b.amountPaise} label={b.status === 'COMPLETED' && b.billedMinutes ? `Final · ${b.billedMinutes} min` : 'Fare'} />
          </View>
          <View style={styles.actions}>
            {canTrack ? <Button title={b.status === 'ONGOING' ? 'Timer & end' : 'Open trip'} small onPress={() => onTrack(b.id)} /> : null}
            {canPay ? <Button title="Pay" small onPress={() => act(b.id, payBooking)} disabled={busyId === b.id} /> : null}
            {canCancel ? <Button title="Cancel" small variant="secondary" onPress={() => act(b.id, cancelBooking)} disabled={busyId === b.id} /> : null}
          </View>
        </Card>
      </FadeIn>
    );
  };

  return (
    <Screen refreshing={refreshing} onRefresh={() => refresh(false)}>
      <AppHeader title="My trips" subtitle={bookings ? `${live.length} active · ${past.length} past` : 'Loading…'} />
      {bookings === null ? (
        <>
          <SkeletonBlock height={120} />
          <SkeletonBlock height={120} />
        </>
      ) : live.length === 0 && past.length === 0 ? (
        <EmptyState title="No trips yet" hint="Book a driver by the hour or grab a parking spot — everything lands here." />
      ) : (
        <>
          {live.length > 0 ? <SectionLabel>Active</SectionLabel> : null}
          {live.map(renderRow)}
          {past.length > 0 ? <SectionLabel>History</SectionLabel> : null}
          {past.map((b, i) => renderRow(b, i + live.length))}
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowCard: { gap: 6 },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  dim: { color: '#6b7280', fontSize: 13 },
  rowFoot: { flexDirection: 'row' },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  error: { color: '#dc2626' },
});
