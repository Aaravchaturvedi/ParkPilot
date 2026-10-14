import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import type { Booking, ParkingSpace } from '../../../../packages/types/src';
import { createSpace, listBookings, mySpaces, updateSpace, acceptBooking } from '../../../../packages/api/src/index';
import { AppHeader, Button, Card, EmptyState, FadeIn, Field, Screen, SectionLabel, StatusPill } from '../../../../packages/ui/src';
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
  const [listing, setListing] = useState(false);
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
    setListing(true);
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
    } finally {
      setListing(false);
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
    <Screen refreshing={loading} onRefresh={() => refresh(false)}>
      <AppHeader title="My spaces" subtitle={`${spaces.filter((s) => s.isActive).length} live · ${incoming.length} parking request${incoming.length === 1 ? '' : 's'}`} />
      <SectionLabel>List a new space</SectionLabel>
      <Card>
        <Field label="Title" placeholder="Basement slot A1" value={title} onChangeText={setTitle} />
        <Field label="Price/hr (₹)" placeholder="80" keyboardType="numeric" value={price} onChangeText={setPrice} />
        <Text style={styles.dim}>{locNote}</Text>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button title={locBusy ? 'Locating…' : 'Use my location'} variant="secondary" onPress={useMyLocation} disabled={locBusy} />
          </View>
          <View style={styles.flex}>
            <Button title="List space" loading={listing} onPress={add} disabled={listing} />
          </View>
        </View>
      </Card>
      {spaces.length > 0 ? <SectionLabel>Your spaces ({spaces.length})</SectionLabel> : null}
      {spaces.map((s, i) => (
        <FadeIn key={s.id} delay={Math.min(i, 5) * 60}>
          <Card>
            <View style={styles.split}>
              <View style={styles.flex}>
                <Text style={styles.title}>{s.title}</Text>
                <Text style={styles.dim}>₹{(s.pricePerHourPaise / 100).toFixed(0)}/hr · {s.lat.toFixed(3)}, {s.lng.toFixed(3)}</Text>
              </View>
              <View style={[styles.dot, s.isActive ? styles.dotOn : styles.dotOff]} />
            </View>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Button title={s.isActive ? 'Pause' : 'Activate'} small variant="secondary" onPress={() => toggle(s)} />
              </View>
              <View style={styles.flex}>
                <Button title="Repin to GPS" small variant="secondary" onPress={() => repin(s)} />
              </View>
            </View>
          </Card>
        </FadeIn>
      ))}
      <SectionLabel>Parking requests ({incoming.length})</SectionLabel>
      {incoming.length === 0 ? <EmptyState title="No parking requests" hint="Bookings on your spaces land here — accept to confirm them." /> : null}
      {incoming.map((b) => (
        <Card key={b.id}>
          <View style={styles.split}>
            <View style={styles.flex}>
              <Text style={styles.title}>₹{(b.amountPaise / 100).toFixed(0)}</Text>
              <Text style={styles.dim}>
                {b.id.slice(0, 8)}
                {b.space ? ` · ${b.space.title}` : ''}
              </Text>
            </View>
            <StatusPill status={b.status} />
          </View>
          <Button title="Accept booking" onPress={() => accept(b.id)} />
        </Card>
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dim: { color: '#6b7280', fontSize: 13 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  split: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 17, fontWeight: '800', color: '#111827' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#d1d5db' },
  dotOn: { backgroundColor: '#16a34a' },
  dotOff: { backgroundColor: '#d1d5db' },
  error: { color: '#dc2626' },
});
