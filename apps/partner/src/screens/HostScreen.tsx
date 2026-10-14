import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import * as Location from 'expo-location';
import type { Booking, ParkingSpace } from '../../../../packages/types/src';
import { createSpace, listBookings, mySpaces, updateSpace, acceptBooking } from '../../../../packages/api/src/index';
import { Button, Card, Field, StatusPill } from '../../../../packages/ui/src';
import { getSocket, ensureSocket } from '../../../../packages/mobile/src/socket';

const FALLBACK_COORDS = { lat: 28.6315, lng: 77.2167 }; // Connaught Place

// Host flow: list spaces, add a space, toggle availability, accept incoming
// parking bookings on own spaces. Parking requests arrive BOTH via socket
// (booking:request to the owner's userRoom) and via REST polling, so a
// missed push never hides a booking. Stays mounted across tab switches.
export function HostScreen({ active = true, apiURL, token }: { active?: boolean; apiURL: string; token: string }): React.JSX.Element {
  const [spaces, setSpaces] = useState<ParkingSpace[]>([]);
  const [incoming, setIncoming] = useState<Booking[]>([]);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('80');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locNote, setLocNote] = useState('Pin location not read yet — tap "Use my location".');
  const [locBusy, setLocBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false): Promise<void> => {
    if (!silent) setLoading(true);
    try {
      const [s, b] = await Promise.all([mySpaces(), listBookings()]);
      setSpaces(s.spaces);
      // Host inbox: PARKING bookings on MY spaces that still need me.
      // (Driver inbox lives in Requests tab — never mix the two.)
      setIncoming(b.bookings.filter((x) => x.type === 'PARKING' && x.status === 'REQUESTED'));
      if (!silent) setError(null);
    } catch {
      if (!silent) setError('Load failed — pull to retry.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  useEffect(() => {
    if (active) void refresh(true);
  }, [active, refresh]);

  // Live parking pushes for my spaces. Uses ensureSocket (not getSocket):
  // this screen mounts before the App shell creates the shared connection,
  // so getSocket() here would be null forever and live pushes would be lost
  // (polling would be the only delivery path).
  useEffect(() => {
    const s = getSocket() ?? ensureSocket(apiURL, token);
    const onRequest = (evt: { booking: Booking }): void => {
      const b = evt.booking;
      if (b.type !== 'PARKING' || b.status !== 'REQUESTED') return;
      setIncoming((list) => (list.some((x) => x.id === b.id) ? list : [b, ...list].slice(0, 20)));
    };
    const onUpdated = (evt: { booking: Booking }): void => {
      const b = evt.booking;
      if (b.type !== 'PARKING') return;
      if (b.status !== 'REQUESTED') setIncoming((list) => list.filter((x) => x.id !== b.id));
      else setIncoming((list) => (list.some((x) => x.id === b.id) ? list.map((x) => (x.id === b.id ? b : x)) : [b, ...list]));
    };
    s.on('booking:request', onRequest);
    s.on('booking:updated', onUpdated);
    return () => {
      s.off('booking:request', onRequest);
      s.off('booking:updated', onUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiURL, token]);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => void refresh(true), 12000);
    return () => clearInterval(t);
  }, [active, refresh]);

  const useMyLocation = useCallback(async (): Promise<void> => {
    setLocBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setLocNote('Location denied — new spaces pin to Connaught Place fallback.');
        setCoords(null);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setLocNote(`Pinned at ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)} (your GPS).`);
    } catch {
      setLocNote('GPS read failed — new spaces pin to Connaught Place fallback.');
      setCoords(null);
    } finally {
      setLocBusy(false);
    }
  }, []);

  useEffect(() => {
    void useMyLocation();
  }, [useMyLocation]);

  const add = async (): Promise<void> => {
    setError(null);
    if (!title.trim()) {
      setError('Give the space a title first.');
      return;
    }
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) {
      setError('Enter a valid price per hour.');
      return;
    }
    try {
      // Pin the space where the host actually is. Fixed demo coords were the
      // reason customer phones never saw the listing: the customer searches
      // within N km of THEIR location, so a space pinned 50 km away is
      // filtered out server-side and no radius button could rescue it.
      const pin = coords ?? FALLBACK_COORDS;
      await createSpace({ title: title.trim(), address: 'New Delhi', lat: pin.lat, lng: pin.lng, pricePerHourPaise: Math.round(p * 100) });
      setTitle('');
      await refresh(true);
    } catch {
      setError('Create failed — check title and price.');
    }
  };

  const toggle = async (s: ParkingSpace): Promise<void> => {
    try {
      await updateSpace(s.id, { isActive: !s.isActive });
      await refresh(true);
    } catch {
      setError('Toggle failed.');
    }
  };

  // Move an existing space to your current GPS. Fixes spaces listed before
  // GPS pinning existed (they all sit on the Connaught Place fallback, which
  // is why a nearby customer phone only sees them at 50 km radius).
  const repin = async (s: ParkingSpace): Promise<void> => {
    setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setError('Location denied — cannot repin.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await updateSpace(s.id, { lat: pos.coords.latitude, lng: pos.coords.longitude });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      await refresh(true);
    } catch {
      setError('Repin failed — check GPS, then retry.');
    }
  };

  const accept = async (id: string): Promise<void> => {
    setError(null);
    try {
      await acceptBooking(id);
      setIncoming((list) => list.filter((x) => x.id !== id));
      await refresh(true);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(msg === 'only_space_owner_accepts' ? 'Only the space owner can accept this.' : 'Accept failed — it may already be taken.');
      await refresh(true);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => refresh(false)} />}
    >
      <Text style={styles.title}>My spaces ({spaces.length})</Text>
      <Card>
        <Field label="Title" placeholder="Basement slot A1" value={title} onChangeText={setTitle} />
        <Field label="Price/hr (₹)" placeholder="80" keyboardType="numeric" value={price} onChangeText={setPrice} />
        <Text style={styles.dim}>{locNote}</Text>
        <Button title={locBusy ? 'Reading GPS…' : coords ? `Location set (${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}) — retake` : 'Use my location'} onPress={useMyLocation} disabled={locBusy} />
        <Button title="List space" onPress={add} />
      </Card>
      {spaces.map((s) => (
        <Card key={s.id}>
          <Text style={styles.title}>{s.title}</Text>
          <Text style={styles.dim}>
            ₹{(s.pricePerHourPaise / 100).toFixed(0)}/hr · {s.isActive ? 'live' : 'paused'} · {s.lat.toFixed(3)}, {s.lng.toFixed(3)}
          </Text>
          <Button title={s.isActive ? 'Pause' : 'Activate'} onPress={() => toggle(s)} />
          <Button title="Repin to my GPS" onPress={() => repin(s)} />
        </Card>
      ))}
      <Text style={styles.title}>Parking requests ({incoming.length})</Text>
      {incoming.length === 0 ? <Text style={styles.dim}>No pending parking bookings on your spaces.</Text> : null}
      {incoming.map((b) => (
        <Card key={b.id}>
          <StatusPill status={b.status} />
          <Text style={styles.dim}>
            {b.id.slice(0, 8)} · {(b.amountPaise / 100).toFixed(2)}
            {b.space ? ` · ${b.space.title}` : ''}
          </Text>
          <Button title="Accept" onPress={() => accept(b.id)} />
        </Card>
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  dim: { color: '#6b7280' },
  error: { color: '#dc2626' },
});
