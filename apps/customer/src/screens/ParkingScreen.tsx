import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import * as Location from 'expo-location';
import { Marker } from 'react-native-maps';
import { SafeMapView } from '../../../../packages/mobile/src/map/SafeMap';
import { coordsLabel, usePlaceName } from '../../../../packages/mobile/src/map/geocode';
import type { Booking, ParkingQuote, ParkingSpace } from '../../../../packages/types/src';
import { createBooking, listBookings, payBooking } from '../../../../packages/api/src/index';
import { quoteParking } from '../../../../packages/api/src/index';
import { Button, PriceTag, StatusPill, FadeIn } from '../../../../packages/ui/src';
import { ensureSocket, getSocket } from '../../../../packages/mobile/src/socket';
import { paiseToRupees } from '../../../../packages/types/src';

// Parking booking: pick hours -> quote -> REQUESTED -> host accepts -> pay.
// Mirrors the driver flow. Subscribes to live updates for OUR booking (socket
// + polling) so the card flips to ACCEPTED the moment the host confirms —
// without this the screen froze on REQUESTED and looked "not confirming".
export function ParkingScreen({ space, apiURL, token, onDone }: { space: ParkingSpace; apiURL: string; token: string; onDone: () => void }): React.JSX.Element {
  const [hours, setHours] = useState(2);
  const [quote, setQuote] = useState<ParkingQuote | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationMin: number } | null>(null);
  const spaceAddress = usePlaceName(space.lat, space.lng);

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
    try {
      const { quote: q } = await quoteParking(space.pricePerHourPaise, hours);
      setQuote(q);
    } catch {
      setError('Quote failed.');
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
            ? 'This space is paused by its host — pick another one.'
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

  return (
    <FadeIn style={styles.fade}>
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{space.title}</Text>
      <Text style={styles.dim}>
        {spaceAddress} · {paiseToRupees(space.pricePerHourPaise)}/hr
      </Text>
      {/* The selected park location on a real map + your driving route to it. */}
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
      <View style={styles.row}>
        <Button title="−" onPress={() => setHours((h) => Math.max(1, h - 1))} />
        <Text style={styles.hours}>{hours}h</Text>
        <Button title="+" onPress={() => setHours((h) => h + 1)} />
      </View>
      <Button title="Get price" onPress={fetchQuote} />
      {quote ? (
        <View style={styles.card}>
          <PriceTag paise={quote.amountPaise} label="Total" />
          <Text style={styles.dim}>
            Platform {quote.commissionBps / 100}% · host gets {(quote.partnerPayoutPaise / 100).toFixed(2)}
          </Text>
          <Button title={busy ? 'Booking…' : 'Confirm parking'} onPress={book} disabled={busy} />
        </View>
      ) : null}
      {booking ? (
        <View style={styles.card}>
          <StatusPill status={booking.status} />
          <Text style={styles.dim}>
            {booking.id.slice(0, 8)} · payment {booking.paymentStatus}
          </Text>
          {booking.status === 'REQUESTED' ? <Text style={styles.dim}>Sent to the host — this card updates live when they accept.</Text> : null}
          {booking.status === 'ACCEPTED' ? <Text style={styles.dim}>Host confirmed — you can pay now.</Text> : null}
          {canPay ? <Button title={busy ? 'Paying…' : 'Pay now (mock)'} onPress={pay} disabled={busy} /> : null}
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Back to map" onPress={onDone} />
    </ScrollView>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  fade: { flex: 1 },
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  map: { height: 200 },
  route: { color: '#4338ca', fontWeight: '700' },
  dim: { color: '#6b7280' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hours: { fontSize: 18, fontWeight: '600' },
  card: { gap: 8, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12 },
  error: { color: '#dc2626' },
});
