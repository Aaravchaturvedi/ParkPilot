import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import { Marker } from 'react-native-maps';
import { SafeMapView } from '../../../../packages/mobile/src/map/SafeMap';
import * as Location from 'expo-location';
import type { Booking, BookingStatus, DriverHoursQuote } from '../../../../packages/types/src';
import { cancelBooking, createBooking, quoteDriverHours } from '../../../../packages/api/src/index';
import { Button, Card, PriceTag, StatusPill } from '../../../../packages/ui/src';
import { ensureSocket, getSocket } from '../../../../packages/mobile/src/socket';

function socketFor(apiURL: string, token: string): ReturnType<typeof ensureSocket> {
  return getSocket() ?? ensureSocket(apiURL, token);
}

interface Pin {
  lat: number;
  lng: number;
}

// Timer-model booking: customer books ESTIMATED HOURS at the fixed platform
// ₹/hr (no distance, no drop). Pickup is pinned on a real map so the partner
// can reach the customer; the timer + OTP handshake lives in TrackingScreen.
export function BookRideScreen({
  apiURL,
  token,
  onTracking,
  active = true,
  lastUpdate = 0,
}: {
  apiURL: string;
  token: string;
  onTracking: (bookingId: string) => void;
  active?: boolean;
  lastUpdate?: number;
}): React.JSX.Element {
  const [hours, setHours] = useState('1');
  const [quote, setQuote] = useState<DriverHoursQuote | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [liveStatus, setLiveStatus] = useState<BookingStatus | null>(null);
  const [notified, setNotified] = useState(0);
  const [pickup, setPickup] = useState<Pin | null>(null);
  const [mapCenter, setMapCenter] = useState({ latitude: 28.6139, longitude: 77.209, latitudeDelta: 0.05, longitudeDelta: 0.05 });
  const [locBusy, setLocBusy] = useState(false);
  const [rejections, setRejections] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  void active;
  void lastUpdate;

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
  }, [apiURL, token, booking?.id]);

  const fetchQuote = async (): Promise<void> => {
    setError(null);
    const h = Number(hours);
    if (!(h > 0)) {
      setError('Enter estimated hours greater than 0.');
      return;
    }
    try {
      const { quote: q } = await quoteDriverHours(h);
      setQuote(q);
    } catch {
      setError('Quote failed — enter valid hours.');
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

  const status = liveStatus ?? booking?.status ?? null;
  const waiting = status === 'REQUESTED';
  const rideOn = status === 'ACCEPTED' || status === 'ONGOING';
  const canCancel = waiting || status === 'ACCEPTED';

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Hire a driver — ₹150/hr</Text>
      <Text style={styles.dim}>Book estimated hours. Final bill = actual timer time (per-minute, 1-hr minimum).</Text>
      <TextInput style={styles.input} placeholder="Estimated hours (e.g. 1.5)" keyboardType="numeric" value={hours} onChangeText={setHours} />
      <Button title="Get price" onPress={fetchQuote} />

      {/* Pickup map: the partner travels to YOU. Drag the map, confirm pin,
          or use GPS. This pin is exposed to partners with your distance. */}
      <View style={styles.pickerCard}>
        <SafeMapView
          initialRegion={mapCenter}
          onRegionChangeComplete={(r: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }) => setMapCenter(r)}
          style={styles.map}
        >
          {pickup ? <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} title="Pickup (you)" pinColor="green" /> : null}
        </SafeMapView>
        <Text style={styles.crosshair}>＋ center = your location</Text>
        <View style={styles.row}>
          <Button
            title="Confirm pickup pin"
            onPress={() => setPickup({ lat: mapCenter.latitude, lng: mapCenter.longitude })}
          />
        </View>
        <Text style={styles.dim}>{pickup ? `Pickup ${pickup.lat.toFixed(4)}, ${pickup.lng.toFixed(4)}` : 'Pickup: not set'}</Text>
      </View>
      <Button title={locBusy ? 'Reading GPS…' : 'Use my GPS as pickup'} onPress={useMyLocation} disabled={locBusy} />

      {quote ? (
        <Card>
          <PriceTag paise={quote.amountPaise} label={`Estimate (${quote.hours} hr)`} />
          <Text style={styles.dim}>
            ₹{(quote.ratePerHourPaise / 100).toFixed(0)}/hr fixed · Platform {quote.commissionBps / 100}% · driver gets {(quote.partnerPayoutPaise / 100).toFixed(2)}
          </Text>
          <Button title={busy ? 'Booking…' : 'Confirm booking'} onPress={book} disabled={busy} />
        </Card>
      ) : null}
      {booking && status ? (
        <Card>
          <StatusPill status={status} />
          <Text style={styles.dim}>
            {booking.id.slice(0, 8)} · {booking.estimatedHours} hr est · {notified} driver(s) notified
            {rejections > 0 ? ` · ${rejections} declined, still searching` : ''}
          </Text>
          {waiting ? <Text style={styles.dim}>Waiting for a partner to accept… keep this tab open or watch Trips.</Text> : null}
          {rideOn ? <Button title="Open trip (OTP & timer)" onPress={() => onTracking(booking.id)} /> : null}
          {status === 'COMPLETED' ? (
            <Text style={styles.dim}>Trip done{booking.paymentStatus === 'PENDING' ? ' — pay from Trips.' : ' — paid.'}</Text>
          ) : null}
          {status === 'CANCELLED' ? <Text style={styles.dim}>Cancelled. Adjust and book again.</Text> : null}
          {canCancel ? <Button title={busy ? 'Cancelling…' : 'Cancel request'} onPress={cancel} disabled={busy} /> : null}
        </Card>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 12, fontSize: 16 },
  pickerCard: { gap: 8, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12 },
  map: { height: 220 },
  crosshair: { textAlign: 'center', color: '#6b7280', fontSize: 12 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dim: { color: '#6b7280' },
  error: { color: '#dc2626' },
});
