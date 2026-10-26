import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker, SafeMapView } from '../../../../packages/mobile/src/map/SafeMap';
import * as Location from 'expo-location';
import type { Booking, BookingStatus, DriverHoursQuote } from '../../../../packages/types/src';
import { cancelBooking, createBooking, getOnlineDrivers, listBookings, payBooking, quoteDriverHours } from '../../../../packages/api/src/index';
import { Button, Card, Field, PriceTag, Screen, StatusPill, WizardHeader, WizardPage, theme } from '../../../../packages/ui/src';
import { Ionicons } from '@expo/vector-icons';
import { usePlaceName } from '../../../../packages/mobile/src/map/geocode';
import { ensureSocket, getSocket } from '../../../../packages/mobile/src/socket';
import { PaymentModal } from '../components/PaymentModal';

function socketFor(apiURL: string, token: string): ReturnType<typeof ensureSocket> {
  return getSocket() ?? ensureSocket(apiURL, token);
}

interface Pin {
  lat: number;
  lng: number;
}

const STEPS = ['Duration', 'Pickup', 'Review'];

// Timer-model booking as pages, not stacked sections:
// Duration -> Pickup -> Review & confirm -> live status. Back arrows walk
// back; each push slides in. An in-flight booking always opens its status
// page (never a blank form), even after an app restart.
export function BookRideScreen({
  apiURL,
  token,
  onTracking,
  onShowTrips,
  active = true,
  lastUpdate = 0,
}: {
  apiURL: string;
  token: string;
  onTracking: (bookingId: string) => void;
  onShowTrips?: () => void;
  active?: boolean;
  lastUpdate?: number;
}): React.JSX.Element {
  const [step, setStep] = useState(0);
  const [backNav, setBackNav] = useState(false);
  const [hours, setHours] = useState('1');
  const [quote, setQuote] = useState<DriverHoursQuote | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [liveStatus, setLiveStatus] = useState<BookingStatus | null>(null);
  const [notified, setNotified] = useState(0);
  const [pickup, setPickup] = useState<Pin>({ lat: 28.6139, lng: 77.209 });
  const pickupPlace = usePlaceName(pickup?.lat, pickup?.lng);
  const [mapCenter, setMapCenter] = useState({ latitude: 28.6139, longitude: 77.209, latitudeDelta: 0.05, longitudeDelta: 0.05 });
  const [locBusy, setLocBusy] = useState(false);
  const [rejections, setRejections] = useState(0);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  void active;

  // Try locating user once on mount to seed default pin near them
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (!cancelled) {
            const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setPickup(p);
            setMapCenter((cur) => ({ ...cur, latitude: p.lat, longitude: p.lng }));
          }
        }
      } catch {
        // silent fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll online driver count every 5 seconds
  useEffect(() => {
    let cancelled = false;
    const fetchOnline = async (): Promise<void> => {
      try {
        const { count } = await getOnlineDrivers();
        if (!cancelled) setOnlineCount(count);
      } catch {
        // silent retry
      }
    };
    void fetchOnline();
    const interval = setInterval(() => void fetchOnline(), 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const go = (next: number, back = false): void => {
    setBackNav(back);
    setError(null);
    setStep(next);
  };

  // Restore the live booking on open so a restart never shows a blank form
  // for a booking that is still REQUESTED on the ledger.
  useEffect(() => {
    let cancelled = false;
    void listBookings()
      .then(({ bookings }) => {
        if (cancelled) return;
        const open = bookings.find((b) => b.type === 'DRIVER' && (b.status === 'REQUESTED' || b.status === 'ACCEPTED' || b.status === 'ONGOING'));
        if (open) {
          setBooking((cur) => cur ?? open);
          setLiveStatus((cur) => cur ?? open.status);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const syncOurs = async (id: string): Promise<void> => {
    try {
      const { bookings } = await listBookings();
      const b = bookings.find((x) => x.id === id);
      if (b) {
        setBooking(b);
        setLiveStatus(b.status);
      }
    } catch {
      // next tick retries
    }
  };

  // Poll convergence while the booking is live (missed pushes still flip it).
  useEffect(() => {
    if (!booking) return;
    const s = liveStatus ?? booking.status;
    if (s === 'COMPLETED' || s === 'CANCELLED') return;
    const t = setInterval(() => void syncOurs(booking.id), 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.id, liveStatus]);

  useEffect(() => {
    if (!booking || lastUpdate === 0) return;
    void syncOurs(booking.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUpdate]);
  useEffect(() => {
    if (!active || !booking) return;
    void syncOurs(booking.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Listen for updates to OUR booking only.
  useEffect(() => {
    if (!booking) return;
    const s = socketFor(apiURL, token);
    s.emit('booking:join', { bookingId: booking.id });
    const onUpdate = (evt: { booking: Booking }): void => {
      if (evt.booking.id === booking.id) {
        setBooking(evt.booking);
        setLiveStatus(evt.booking.status);
      }
    };
    const onAccepted = (evt: { booking: Booking }): void => {
      if (evt.booking.id === booking.id) {
        setBooking(evt.booking);
        setLiveStatus(evt.booking.status);
        onTracking(evt.booking.id);
      }
    };
    const onRejected = (evt: { bookingId: string }): void => {
      if (evt.bookingId === booking.id) setRejections((n) => n + 1);
    };
    s.on('booking:updated', onUpdate);
    s.on('booking:accepted', onAccepted);
    s.on('booking:rejected', onRejected);
    return () => {
      s.off('booking:updated', onUpdate);
      s.off('booking:accepted', onAccepted);
      s.off('booking:rejected', onRejected);
    };
  }, [apiURL, token, booking?.id, onTracking]);

  const status = liveStatus ?? booking?.status ?? null;
  const live = status !== null && status !== 'COMPLETED' && status !== 'CANCELLED';
  const waiting = status === 'REQUESTED';
  const rideOn = status === 'ACCEPTED' || status === 'ONGOING';
  const canCancel = waiting || status === 'ACCEPTED';

  // Automatically take customer directly to the trip location screen upon acceptance
  useEffect(() => {
    if (rideOn && booking?.id) {
      onTracking(booking.id);
    }
  }, [rideOn, booking?.id, onTracking]);

  // When a booking completes and is paid, auto-reset so customer is on clean request homepage
  useEffect(() => {
    if (booking?.status === 'COMPLETED' && booking.paymentStatus === 'COMPLETED') {
      freshStart();
    }
  }, [booking?.status, booking?.paymentStatus]);

  const getPrice = async (): Promise<void> => {
    const h = Number(hours);
    if (!(h > 0)) {
      setError('Enter estimated hours greater than 0.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { quote: q } = await quoteDriverHours(h);
      setQuote(q);
      go(1);
    } catch {
      setError('Quote failed — enter valid hours.');
    } finally {
      setBusy(false);
    }
  };

  const useMyLocation = async (): Promise<void> => {
    setLocBusy(true);
    setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setError('Location permission denied — pin pickup on the map instead.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const pin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setPickup(pin);
      setMapCenter((r) => ({ ...r, latitude: pin.lat, longitude: pin.lng }));
    } catch {
      setError('Could not read GPS — pin pickup on the map instead.');
    } finally {
      setLocBusy(false);
    }
  };

  const book = async (): Promise<void> => {
    const h = Number(hours);
    if (!(h > 0)) {
      setError('Enter estimated hours greater than 0.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { booking: b, notified: n } = await createBooking({
        type: 'DRIVER',
        hours: h,
        ...(pickup ? { pickupLat: pickup.lat, pickupLng: pickup.lng } : {}),
      });
      setBooking(b);
      setLiveStatus(b.status);
      setNotified(n.length);
      setRejections(0);
      socketFor(apiURL, token).emit('booking:join', { bookingId: b.id });
      if (n.length === 0) {
        setError('No drivers online right now — your request is queued and will appear when a partner goes online.');
      }
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(msg === 'only_customers_book' ? 'Partners cannot book rides — use a customer account.' : 'Booking failed.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (): Promise<void> => {
    if (!booking) return;
    setBusy(true);
    try {
      const { booking: b } = await cancelBooking(booking.id);
      setBooking(b);
      setLiveStatus(b.status);
    } catch {
      setError('Cancel failed — the trip may already be accepted/completed.');
    } finally {
      setBusy(false);
    }
  };

  const freshStart = (): void => {
    setBooking(null);
    setLiveStatus(null);
    setQuote(null);
    setNotified(0);
    setRejections(0);
    setError(null);
    go(0, true);
  };

  // An in-flight booking owns the screen: its status page, with a back arrow
  // to the trips ledger — never a form that could double-book.
  if (booking && live && status) {
    return (
      <Screen>
        <WizardHeader title="Your request" step={2} total={STEPS.length} onBack={onShowTrips} />
        <WizardPage pageKey={`status-${booking.id}-${status}`} fromLeft>
          <Card style={styles.liveCard}>
            <View style={styles.liveHead}>
              <Text style={styles.liveTitle}>Request {booking.id.slice(0, 8)}</Text>
              <StatusPill status={status} />
            </View>
            <Text style={styles.dim}>
              {booking.estimatedHours} hr estimate{notified > 0 ? ` · ${notified} driver(s) notified` : ''}
              {rejections > 0 ? ` · ${rejections} declined, still searching` : ''}
            </Text>
            {waiting ? (
              <View style={styles.waitingStatusBox}>
                <Text style={styles.dim}>Waiting for a partner</Text>
                <View style={styles.driverPillInline}>
                  <View style={[styles.statusDot, { backgroundColor: (onlineCount ?? 0) > 0 ? '#10b981' : '#f59e0b' }]} />
                  <Text style={styles.dim}>
                    {onlineCount !== null ? `${onlineCount} driver${onlineCount === 1 ? '' : 's'} online nearby` : 'Searching for nearby drivers…'}
                  </Text>
                </View>
              </View>
            ) : null}
            {rideOn ? <Button title="Open trip — live location" block onPress={() => onTracking(booking.id)} /> : null}
            {canCancel ? <Button title="Cancel request" variant="secondary" onPress={cancel} disabled={busy} /> : null}
          </Card>
        </WizardPage>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Screen>
    );
  }

  // A finished booking leaves a receipt + a clean way back to a new one.
  if (booking && status && !live) {
    if (status === 'COMPLETED' && booking.paymentStatus === 'COMPLETED') {
      return (
        <Screen>
          <View style={styles.center}>
            <Text style={styles.dim}>Trip completed and paid. Returning to home…</Text>
          </View>
        </Screen>
      );
    }
    return (
      <Screen>
        <WizardHeader title="Hire a driver" step={2} total={STEPS.length} onBack={freshStart} />
        <WizardPage pageKey={`done-${booking.id}`} fromLeft>
          <Card>
            <View style={styles.liveHead}>
              <Text style={styles.liveTitle}>Trip {status === 'COMPLETED' ? 'finished' : 'cancelled'}</Text>
              <StatusPill status={status} />
            </View>
            <Text style={styles.dim}>
              {booking.billedMinutes ? `Billed ${booking.billedMinutes} min · ` : ''}payment {booking.paymentStatus.toLowerCase()}
            </Text>
            {status === 'COMPLETED' && booking.paymentStatus === 'PENDING' ? (
              <Button
                title={`Pay ₹${((booking.amountPaise || 0) / 100).toFixed(0)} now`}
                block
                onPress={() => {
                  /* Payment modal is already visible */
                }}
              />
            ) : (
              <Button title="Book another ride" block onPress={freshStart} />
            )}
          </Card>
        </WizardPage>
        <PaymentModal
          visible={status === 'COMPLETED' && booking.paymentStatus === 'PENDING'}
          booking={booking}
          onPay={async () => {
            const { booking: b } = await payBooking(booking.id);
            setBooking(b);
          }}
          onPaidSuccess={freshStart}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <WizardHeader title="Hire a driver" step={step} total={STEPS.length} onBack={step > 0 ? () => go(step - 1, true) : undefined} />
      {step === 0 ? (
        <WizardPage pageKey="s0" fromLeft={backNav}>
          <View style={styles.driverPill}>
            <View style={[styles.statusDot, { backgroundColor: (onlineCount ?? 0) > 0 ? '#10b981' : '#f59e0b' }]} />
            <Text style={styles.driverPillText}>
              {onlineCount === null
                ? 'Locating drivers…'
                : onlineCount > 0
                  ? `${onlineCount} driver${onlineCount === 1 ? '' : 's'} online nearby`
                  : 'No drivers online right now'}
            </Text>
          </View>
          <Text style={styles.lead}>Reserve a verified driver by the hour.</Text>
          <Card>
            <Field label="Estimated hours" placeholder="e.g. 1.5" keyboardType="numeric" value={hours} onChangeText={setHours} />
            <Button title="Get price" block loading={busy} onPress={getPrice} disabled={busy} />
          </Card>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </WizardPage>
      ) : null}
      {step === 1 ? (
        <WizardPage pageKey="s1" fromLeft={backNav}>
          <Card>
            <Text style={styles.cardTitle}>Pickup location</Text>
            <View style={styles.mapWrap}>
              <SafeMapView
                initialRegion={mapCenter}
                center={{ latitude: mapCenter.latitude, longitude: mapCenter.longitude }}
                onRegionChangeComplete={(r: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }) => {
                  setMapCenter(r);
                  setPickup({ lat: r.latitude, lng: r.longitude });
                }}
                onPress={(coord: { latitude: number; longitude: number }) => {
                  setPickup({ lat: coord.latitude, lng: coord.longitude });
                  setMapCenter((cur) => ({ ...cur, latitude: coord.latitude, longitude: coord.longitude }));
                }}
                style={styles.map}
              >
                <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} title="Pickup" pinColor="green" />
              </SafeMapView>
              <View pointerEvents="none" style={styles.centerPinAnchor}>
                <View style={styles.centerPin}>
                  <View style={styles.centerPinInner} />
                </View>
                <View style={styles.centerPinNeedle} />
                <View style={styles.centerPinBase} />
              </View>
            </View>
            <Button
              title={locBusy ? 'Locating…' : 'Use my current location'}
              icon={<Ionicons name="location-sharp" size={16} color="#000000" />}
              variant="secondary"
              onPress={useMyLocation}
              disabled={locBusy}
            />
            <Text style={styles.pickup}>Pickup: {pickupPlace || `${pickup.lat.toFixed(4)}, ${pickup.lng.toFixed(4)}`}</Text>
            <Button title="Continue" block onPress={() => go(2)} />
          </Card>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </WizardPage>
      ) : null}
      {step === 2 ? (
        <WizardPage pageKey="s2" fromLeft={backNav}>
          <Card style={styles.quoteCard}>
            <View style={styles.driverPillInline}>
              <View style={[styles.statusDot, { backgroundColor: (onlineCount ?? 0) > 0 ? '#10b981' : '#f59e0b' }]} />
              <Text style={styles.driverPillTextSmall}>
                {onlineCount === null
                  ? 'Checking availability…'
                  : onlineCount > 0
                    ? `${onlineCount} driver${onlineCount === 1 ? '' : 's'} online to accept`
                    : 'No drivers online right now'}
              </Text>
            </View>
            {quote ? <PriceTag paise={quote.amountPaise} label={`Estimate · ${quote.hours} hr`} /> : null}
            <Text style={styles.dim}>
              {hours} hr · ₹150/hr
            </Text>
            <Text style={styles.pickup}>Pickup: {pickupPlace || `${pickup.lat.toFixed(4)}, ${pickup.lng.toFixed(4)}`}</Text>
            <Button title="Confirm booking" block loading={busy} onPress={book} disabled={busy} />
          </Card>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </WizardPage>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dim: { color: '#6b7280', fontSize: 13 },
  lead: { fontSize: 15, color: '#374151' },
  mapWrap: { position: 'relative', width: '100%', height: 260, borderRadius: 12, overflow: 'hidden' },
  map: { width: '100%', height: '100%', borderRadius: 12 },
  centerPinAnchor: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -16,
    marginTop: -28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  centerPin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#16a34a',
    borderWidth: 3,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
  centerPinInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ffffff',
  },
  centerPinNeedle: {
    width: 4,
    height: 8,
    backgroundColor: '#16a34a',
    marginTop: -1,
  },
  centerPinBase: {
    width: 8,
    height: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.25)',
    marginTop: 1,
  },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  pickup: { fontSize: 14, fontWeight: '700', color: '#111827' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  quoteCard: { borderColor: '#000000', borderWidth: 1 },
  liveCard: { borderColor: '#000000', borderWidth: 1 },
  liveHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  driverPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#f1f5f9', borderRadius: 999, alignSelf: 'flex-start', marginBottom: 10 },
  driverPillText: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  driverPillInline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  driverPillTextSmall: { fontSize: 12, fontWeight: '600', color: '#475569' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  waitingStatusBox: { gap: 6 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  error: { color: '#dc2626' },
});
