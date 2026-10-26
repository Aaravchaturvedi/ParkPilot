import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { Marker, SafeMapView } from '../../../../packages/mobile/src/map/SafeMap';
import { coordsLabel, usePlaceName } from '../../../../packages/mobile/src/map/geocode';
import type { Booking, ParkingQuote, ParkingSpace } from '../../../../packages/types/src';
import { createBooking, listBookings, payBooking } from '../../../../packages/api/src/index';
import { quoteParking } from '../../../../packages/api/src/index';
import { Button, Card, PriceTag, Screen, StatusPill, WizardHeader, WizardPage } from '../../../../packages/ui/src';
import { ensureSocket, getSocket } from '../../../../packages/mobile/src/socket';
import { paiseToRupees } from '../../../../packages/types/src';

const STEPS = ['Your stay', 'Review'];

// Parking booking as pages: stay details + hours on page one, a review page
// to confirm, then a live status page. Back arrows walk back; the status
// page's back exits to the map (the booking lives on in Trips).
export function ParkingScreen({ space, apiURL, token, onDone }: { space: ParkingSpace; apiURL: string; token: string; onDone: () => void }): React.JSX.Element {
  const [step, setStep] = useState(0);
  const [backNav, setBackNav] = useState(false);
  const [hours, setHours] = useState(2);
  const [quote, setQuote] = useState<ParkingQuote | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationMin: number } | null>(null);
  const spaceAddress = usePlaceName(space.lat, space.lng);

  const go = (next: number, back = false): void => {
    setBackNav(back);
    setError(null);
    setStep(next);
  };

  // Own GPS: origin of the driving route to the space (silent fail = no route).
  useEffect(() => {
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        // route simply stays hidden
      }
    })();
  }, []);

  // Live status for our booking only.
  useEffect(() => {
    if (!booking) return;
    const s = getSocket() ?? ensureSocket(apiURL, token);
    s.emit('booking:join', { bookingId: booking.id });
    const onUpdate = (evt: { booking: Booking }): void => {
      if (evt.booking.id === booking.id) setBooking(evt.booking);
    };
    s.on('booking:updated', onUpdate);
    const poll = setInterval(() => {
      listBookings()
        .then(({ bookings }) => {
          const b = bookings.find((x) => x.id === booking.id);
          if (b) setBooking(b);
        })
        .catch(() => undefined);
    }, 8000);
    return () => {
      clearInterval(poll);
      s.off('booking:updated', onUpdate);
      s.emit('booking:leave', { bookingId: booking.id });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiURL, token, booking?.id]);

  const fetchQuote = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      const { quote: q } = await quoteParking(space.pricePerHourPaise, hours);
      setQuote(q);
      go(1);
    } catch {
      setError('Quote failed.');
    } finally {
      setBusy(false);
    }
  };

  const book = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const { booking: b } = await createBooking({ type: 'PARKING', spaceId: space.id, hours });
      setBooking(b);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(
        msg === 'only_customers_book'
          ? 'Partners cannot book parking — use a customer account.'
          : msg === 'space_not_available'
            ? 'This space was paused by its host — pick another one.'
            : 'Booking failed.',
      );
    } finally {
      setBusy(false);
    }
  };

  const pay = async (): Promise<void> => {
    if (!booking) return;
    setBusy(true);
    try {
      const { booking: b } = await payBooking(booking.id);
      setBooking(b);
    } catch {
      setError('Payment needs the host to accept first — wait, then retry.');
    } finally {
      setBusy(false);
    }
  };

  const canPay = booking != null && booking.paymentStatus === 'PENDING' && (booking.status === 'ACCEPTED' || booking.status === 'ONGOING' || booking.status === 'COMPLETED');

  if (booking) {
    return (
      <Screen>
        <WizardHeader title={space.title} step={1} total={STEPS.length} onBack={onDone} />
        <WizardPage pageKey={`pstatus-${booking.id}-${booking.status}`} fromLeft>
          <Card style={styles.quoteCard}>
            <View style={styles.split}>
              <Text style={styles.liveTitle}>Booking {booking.id.slice(0, 8)}</Text>
              <StatusPill status={booking.status} />
            </View>
            <Text style={styles.dim}>
              {space.title} · {hours}h
            </Text>
            {booking.status === 'REQUESTED' ? <Text style={styles.dim}>Waiting for host confirmation…</Text> : null}
            {canPay ? <Button title={`Pay ₹${((booking.amountPaise || 0) / 100).toFixed(0)}`} block loading={busy} onPress={pay} disabled={busy} /> : null}
          </Card>
        </WizardPage>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Screen>
    );
  }

  return (
    <Screen>
      <WizardHeader title={space.title} step={step} total={STEPS.length} onBack={step > 0 ? () => go(step - 1, true) : onDone} />
      {step === 0 ? (
        <WizardPage pageKey="p0" fromLeft={backNav}>
          <Text style={styles.dim}>
            {spaceAddress} · {paiseToRupees(space.pricePerHourPaise)}/hr
          </Text>
          <SafeMapView
            initialRegion={{ latitude: space.lat, longitude: space.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
            style={styles.map}
            route={me ? { from: { latitude: me.lat, longitude: me.lng }, to: { latitude: space.lat, longitude: space.lng } } : null}
            onRouteInfo={setRouteInfo}
          >
            {me ? <Marker coordinate={{ latitude: me.lat, longitude: me.lng }} title="You" pinColor="blue" /> : null}
            <Marker coordinate={{ latitude: space.lat, longitude: space.lng }} title={space.title} pinColor="red" />
          </SafeMapView>
          {routeInfo ? (
            <Text style={styles.route}>Drive: {routeInfo.distanceKm.toFixed(1)} km · ~{Math.max(1, Math.round(routeInfo.durationMin))} min from your location</Text>
          ) : (
            <Text style={styles.dim}>Pinned at {coordsLabel(space.lat, space.lng)}</Text>
          )}
          <Card>
            <Text style={styles.cardTitle}>How long do you need it?</Text>
            <View style={styles.stepper}>
              <Button title="−" variant="secondary" onPress={() => setHours((h) => Math.max(1, h - 1))} />
              <Text style={styles.hours}>{hours}h</Text>
              <Button title="+" variant="secondary" onPress={() => setHours((h) => h + 1)} />
            </View>
            <Button title="See price" block loading={busy} onPress={fetchQuote} disabled={busy} />
          </Card>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </WizardPage>
      ) : null}
      {step === 1 ? (
        <WizardPage pageKey="p1" fromLeft={backNav}>
          <Card style={styles.quoteCard}>
            {quote ? <PriceTag paise={quote.amountPaise} label={`Total · ${hours}h at ${space.title}`} /> : null}
            <Text style={styles.dim}>
              {spaceAddress}
              {quote ? ` · host gets ${(quote.partnerPayoutPaise / 100).toFixed(2)} after ${quote.commissionBps / 100}% fee` : ''}
            </Text>
            {routeInfo ? (
              <Text style={styles.dim}>About {routeInfo.distanceKm.toFixed(1)} km from you (~{Math.max(1, Math.round(routeInfo.durationMin))} min drive).</Text>
            ) : null}
            <Button title="Confirm parking" block loading={busy} onPress={book} disabled={busy} />
          </Card>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </WizardPage>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  map: { height: 240, borderRadius: 16 },
  route: { color: '#111827', fontWeight: '700', fontSize: 13 },
  dim: { color: '#6b7280', fontSize: 13 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hours: { fontSize: 22, fontWeight: '800', color: '#111827', minWidth: 56, textAlign: 'center' },
  quoteCard: { borderColor: '#000000', borderWidth: 1 },
  split: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  error: { color: '#dc2626' },
});
