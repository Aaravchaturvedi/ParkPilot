import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import type { Booking, BookingStatus, DriverQuote } from '../../../../packages/types/src';
import { createBooking, quoteDriver } from '../../../../packages/api/src/index';
import { Button, PriceTag } from '../../../../packages/ui/src';
import { connectSocket } from '../socket';

// MVP: customer enters trip km (device GPS routing is post-MVP).
export function BookRideScreen({ apiURL, token }: { apiURL: string; token: string }): React.JSX.Element {
  const [km, setKm] = useState('10');
  const [quote, setQuote] = useState<DriverQuote | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [liveStatus, setLiveStatus] = useState<BookingStatus | null>(null);
  const [notified, setNotified] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = connectSocket(apiURL, token);
    const onUpdate = (evt: { booking: Booking }): void => setLiveStatus(evt.booking.status);
    s.on('booking:updated', onUpdate);
    return () => {
      s.off('booking:updated', onUpdate);
    };
  }, [apiURL, token]);

  const fetchQuote = async (): Promise<void> => {
    setError(null);
    try {
      const { quote: q } = await quoteDriver(Number(km));
      setQuote(q);
    } catch {
      setError('Quote failed — enter a valid distance.');
    }
  };

  const book = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const { booking: b, notified: n } = await createBooking({ type: 'DRIVER', distanceKm: Number(km) });
      setBooking(b);
      setLiveStatus(b.status);
      setNotified(n.length);
      connectSocket(apiURL, token).emit('booking:join', { bookingId: b.id });
    } catch {
      setError('Booking failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Book a driver — ₹8/KM</Text>
      <TextInput style={styles.input} placeholder="Distance (km)" keyboardType="numeric" value={km} onChangeText={setKm} />
      <Button title="Get price" onPress={fetchQuote} />
      {quote ? (
        <View style={styles.card}>
          <PriceTag paise={quote.amountPaise} label="Trip" />
          <Text style={styles.dim}>
            Platform fee {quote.commissionBps / 100}% · driver gets {(quote.partnerPayoutPaise / 100).toFixed(2)}
          </Text>
          <Button title={busy ? 'Booking…' : 'Confirm booking'} onPress={book} disabled={busy} />
        </View>
      ) : null}
      {booking ? (
        <Text style={styles.status}>
          {booking.id.slice(0, 8)} · {liveStatus ?? booking.status} · {notified} driver(s) notified
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 12, fontSize: 16 },
  card: { gap: 8, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12 },
  dim: { color: '#6b7280' },
  status: { fontWeight: '600' },
  error: { color: '#dc2626' },
});
