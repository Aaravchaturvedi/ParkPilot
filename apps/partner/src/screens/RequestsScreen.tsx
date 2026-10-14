import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import { SafeMapView } from '../../../../packages/mobile/src/map/SafeMap';
import * as Location from 'expo-location';
import type { Booking } from '../../../../packages/types/src';
import { formatKm, haversineKm } from '../../../../packages/types/src';
import { AppHeader, Button, Card, EmptyState, FadeIn, Screen, SectionLabel, SegmentedControl, StatusPill } from '../../../../packages/ui/src';
import { usePlaceName } from '../../../../packages/mobile/src/map/geocode';
import { connectSocket, getSocket } from '../../../../packages/mobile/src/socket';
import { acceptBooking as restAccept } from '../../../../packages/api/src/index';

export interface Incoming {
  booking: Booking;
  at: number;
}

interface Props {
  apiURL: string;
  token: string;
  online: boolean;
  setOnline: (v: boolean) => void;
  incoming: Incoming[];
  setIncoming: (updater: (list: Incoming[]) => Incoming[]) => void;
  onActive: (bookingId: string) => void;
  // Optional App-level helpers (new). All optional so existing tests keep passing.
  onDismissed?: (id: string) => void;
  onSync?: () => void | Promise<unknown>;
  active?: boolean;
}

const FILTERS = [{ label: 'All', km: Infinity }, { label: '≤2 km', km: 2 }, { label: '≤5 km', km: 5 }, { label: '≤10 km', km: 10 }];

function sock(apiURL: string, token: string): ReturnType<typeof connectSocket> | null {
  try {
    return getSocket() ?? connectSocket(apiURL, token);
  } catch {
    return null;
  }
}

function age(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

function pickupOf(b: Booking): { lat: number; lng: number } | null {
  return b.pickupLat != null && b.pickupLng != null ? { lat: b.pickupLat, lng: b.pickupLng } : null;
}

// Driver inbox, nearest first. Each request exposes the customer's pickup
// (where they are); distances are measured from YOUR live GPS via the same
// haversine math the customer app uses, so both sides agree on "2 km away".
export function RequestsScreen({ apiURL, token, online, setOnline, incoming, setIncoming, onActive, onDismissed, onSync, active = true }: Props): React.JSX.Element {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [locNote, setLocNote] = useState<string | null>(null);
  const [maxKm, setMaxKm] = useState(Infinity);
  const [toggling, setToggling] = useState(false);

  // Whenever the tab becomes visible while online, converge with the ledger
  // (covers pushes missed while the app was backgrounded).
  useEffect(() => {
    if (active && online) void onSync?.();
  }, [active, online, onSync]);

  // Own GPS: the ruler every distance is measured with. Refreshed on mount,
  // on tab focus, and manually — a stale fix would mis-sort the whole inbox.
  const locate = async (): Promise<void> => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setLocNote('Location denied — distances unavailable.');
        setMe(null);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setLocNote(null);
    } catch {
      setLocNote('GPS unavailable — distances unavailable.');
      setMe(null);
    }
  };
  useEffect(() => {
    void locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (active && online) void locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const remove = (id: string): void => {
    if (onDismissed) onDismissed(id);
    else setIncoming((list) => list.filter((i) => i.booking.id !== id));
  };

  // Nearest first; requests without a shared pickup sink to the bottom.
  // A distance filter hides far/unknown pickups (unknown = unmeasurable).
  const visible = useMemo(() => {
    const rows = incoming.map((i) => {
      const p = pickupOf(i.booking);
      const kmAway = p && me ? haversineKm(me.lat, me.lng, p.lat, p.lng) : null;
      return { ...i, kmAway };
    });
    rows.sort((a, b) => (a.kmAway ?? Infinity) - (b.kmAway ?? Infinity));
    return rows.filter((r) => (r.kmAway ?? Infinity) <= maxKm);
  }, [incoming, me, maxKm]);

  const toggle = (): void => {
    const s = sock(apiURL, token);
    if (!s) {
      setError('No connection — check network, then retry.');
      return;
    }
    if (online) {
      try {
        s.emit('partner:offline', {});
      } catch {
        // ignore
      }
      setOnline(false);
      return;
    }
    // The server only dispatches to registered-online partners: the toggle
    // MUST confirm registration, never just flip local state.
    setToggling(true);
    void (async () => {
      try {
        const ack = (await s.emitWithAck('partner:online', {})) as { ok: boolean; error?: string };
        if (ack.ok) {
          setOnline(true);
          setError(null);
          void locate();
          void onSync?.();
        } else setError(ack.error ?? 'Go-online failed — check connection, then retry.');
      } catch {
        setError('Go-online failed — check connection, then retry.');
      } finally {
        setToggling(false);
      }
    })();
  };

  const accept = async (id: string): Promise<void> => {
    setBusyId(id);
    setError(null);
    // Prefer the socket (server joins us to the booking room + pushes live
    // updates). Fall back to REST if the socket is down — same state change.
    try {
      const s = sock(apiURL, token);
      if (s) {
        const ack = (await s.emitWithAck('booking:accept', { bookingId: id })) as { ok: boolean; error?: string; booking?: Booking };
        if (ack.ok && ack.booking) {
          remove(id);
          onActive(ack.booking.id);
          return;
        }
        // booking_not_requested / already-taken is final: drop the card.
        if (ack.error === 'booking_not_requested') {
          remove(id);
          setError('That request was already taken by another partner.');
          return;
        }
        if (ack.error && ack.error !== 'booking_not_requested') {
          // Try REST before giving up (socket may be stale).
        }
      }
    } catch {
      // fall through to REST
    }
    try {
      const { booking } = await restAccept(id);
      remove(id);
      onActive(booking.id);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      if (msg === 'booking_not_requested') {
        remove(id);
        setError('That request was already taken by another partner.');
      } else {
        setError('Accept failed — check connection, then retry.');
      }
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: string): Promise<void> => {
    // Reject = local dismissal (global status stays REQUESTED so other
    // partners can still accept). Always dismiss, even if the notify fails.
    try {
      const s = sock(apiURL, token);
      if (s) await s.emitWithAck('booking:reject', { bookingId: id });
    } catch {
      // dismissal still applies
    } finally {
      remove(id);
    }
  };

  return (
    <Screen>
      <AppHeader
        title="Requests"
        subtitle={online ? (me ? 'Online · nearest first' : 'Online · locating you…') : 'You’re offline'}
        right={<View style={[styles.dot, online ? styles.dotOn : styles.dotOff]} />}
      />
      <Card style={[styles.presence, online ? styles.presenceOn : styles.presenceOff]}>
        <View style={styles.presenceCol}>
          <Text style={styles.presenceTitle}>{online ? 'Accepting rides' : 'Not receiving rides'}</Text>
          <Text style={styles.dim}>{online ? (me ? `GPS ${me.lat.toFixed(3)}, ${me.lng.toFixed(3)}` : (locNote ?? 'Reading GPS…')) : 'Go online — requests land here automatically.'}</Text>
        </View>
        <Button title={toggling ? '…' : online ? 'Go offline' : 'Go online'} small variant={online ? 'secondary' : 'primary'} onPress={toggle} disabled={toggling} />
      </Card>
      <View style={styles.headRow}>
        <Text style={styles.count}>{online ? `${visible.length} request${visible.length === 1 ? '' : 's'}` : 'Inbox'}</Text>
        {online ? <Button title="Refresh" small variant="secondary" onPress={() => { void locate(); onSync?.(); }} /> : null}
      </View>
      <SegmentedControl options={FILTERS.map((f) => ({ value: f.label, label: f.label }))} value={FILTERS.find((f) => f.km === maxKm)?.label ?? 'All'} onChange={(label) => setMaxKm(FILTERS.find((f) => f.label === label)?.km ?? Infinity)} />
      {online && visible.length === 0 && incoming.length > 0 ? <Text style={styles.dim}>All {incoming.length} request(s) are outside this distance filter — widen it.</Text> : null}
      {online && incoming.length === 0 ? (
        <EmptyState title="No requests yet" hint="Stay online — new bookings pop up here automatically, nearest first." />
      ) : null}
      {!online && incoming.length === 0 ? <EmptyState title="You're offline" hint="Go online to receive ride requests." /> : null}
      {visible.map(({ booking, at, kmAway }, i) => (
        <FadeIn key={booking.id} delay={Math.min(i, 5) * 60}>
          <RequestCard
            booking={booking}
            at={at}
            kmAway={kmAway}
            me={me}
            busy={busyId === booking.id}
            onAccept={() => accept(booking.id)}
            onReject={() => reject(booking.id)}
          />
        </FadeIn>
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

// One request card: own hooks for expand/route/place-name (hooks can't live
// in the .map above). Shows WHERE the customer is in words, how far, and the
// driving route there — a partner decides by place, not by coordinates.
function RequestCard({
  booking,
  at,
  kmAway,
  me,
  busy,
  onAccept,
  onReject,
}: {
  booking: Booking;
  at: number;
  kmAway: number | null;
  me: { lat: number; lng: number } | null;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationMin: number } | null>(null);
  const pickup = pickupOf(booking);
  const place = usePlaceName(pickup?.lat, pickup?.lng);
  return (
    <Card style={styles.reqCard}>
      <View style={styles.reqHead}>
        <View>
          <Text style={styles.fare}>₹{(booking.amountPaise / 100).toFixed(0)} <Text style={styles.fareSub}>est · {booking.estimatedHours ?? '?'} hr</Text></Text>
          <Text style={styles.dim}>You keep {(booking.partnerPayoutPaise / 100).toFixed(2)} · {age(at)}</Text>
        </View>
        <StatusPill status={booking.status} />
      </View>
      <Text style={styles.away}>
        {kmAway !== null
          ? `${formatKm(kmAway)} away from you`
          : pickup
            ? 'Enable GPS to see your distance'
            : 'Distance unknown (customer shared no pickup)'}
      </Text>
      <Text style={styles.dim}>Pickup: {pickup ? place : 'not shared'}</Text>
      {pickup && me ? (
        <View style={styles.mapWrap}>
          {open ? (
            <>
              <SafeMapView
                initialRegion={{
                  latitude: (me.lat + pickup.lat) / 2,
                  longitude: (me.lng + pickup.lng) / 2,
                  latitudeDelta: Math.max(0.02, Math.abs(me.lat - pickup.lat) * 2.5),
                  longitudeDelta: Math.max(0.02, Math.abs(me.lng - pickup.lng) * 2.5),
                }}
                style={styles.map}
                route={{ from: { latitude: me.lat, longitude: me.lng }, to: { latitude: pickup.lat, longitude: pickup.lng } }}
                onRouteInfo={setRouteInfo}
              >
                <Marker coordinate={{ latitude: me.lat, longitude: me.lng }} title="You" pinColor="blue" />
                <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} title="Pickup" pinColor="green" />
              </SafeMapView>
              {routeInfo ? (
                <Text style={styles.route}>Drive: {routeInfo.distanceKm.toFixed(1)} km · ~{Math.max(1, Math.round(routeInfo.durationMin))} min to customer</Text>
              ) : (
                <Text style={styles.dim}>Finding the driving route…</Text>
              )}
            </>
          ) : null}
          <Button title={open ? 'Hide map' : 'See route'} variant="secondary" small onPress={() => setOpen(!open)} />
        </View>
      ) : null}
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button title="Accept" loading={busy} onPress={onAccept} disabled={busy} />
        </View>
        <View style={styles.flex}>
          <Button title="Reject" variant="secondary" onPress={onReject} disabled={busy} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  dot: { width: 12, height: 12, borderRadius: 6 },
  dotOn: { backgroundColor: '#16a34a' },
  dotOff: { backgroundColor: '#d1d5db' },
  presence: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  presenceOn: { borderColor: '#16a34a', borderWidth: 1.5 },
  presenceOff: {},
  presenceCol: { flex: 1, gap: 2 },
  presenceTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  dim: { color: '#6b7280', fontSize: 13 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { fontSize: 16, fontWeight: '800', color: '#111827' },
  reqCard: { gap: 8 },
  reqHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  fare: { fontSize: 22, fontWeight: '800', color: '#111827' },
  fareSub: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  away: { fontSize: 15, fontWeight: '700', color: '#4338ca' },
  mapWrap: { gap: 8 },
  map: { height: 180, borderRadius: 12 },
  route: { color: '#4338ca', fontWeight: '700', fontSize: 13 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  error: { color: '#dc2626' },
});
