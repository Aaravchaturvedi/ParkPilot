import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Booking, ParkingQuote, ParkingSpace } from '../../../../packages/types/src';
import { createBooking, quoteParking } from '../../../../packages/api/src/index';
import { Button, PriceTag } from '../../../../packages/ui/src';
import { paiseToRupees } from '../../../../packages/types/src';

export function ParkingScreen({ space, onDone }: { space: ParkingSpace; onDone: () => void }): React.JSX.Element {
  const [hours, setHours] = useState(2);
  const [quote, setQuote] = useState<ParkingQuote | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchQuote = async (): Promise<void> => {
    try {
      const { quote: q } = await quoteParking(space.pricePerHourPaise, hours);
      setQuote(q);
    } catch {
      setError('Quote failed.');
    }
  };

  const book = async (): Promise<void> => {
    try {
      const { booking: b } = await createBooking({ type: 'PARKING', spaceId: space.id, hours });
      setBooking(b);
    } catch {
      setError('Booking failed.');
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{space.title}</Text>
      <Text style={styles.dim}>
        {space.address} · {paiseToRupees(space.pricePerHourPaise)}/hr
      </Text>
      <View style={styles.row}>
        <Button title="−" onPress={() => setHours((h) => Math.max(1, h - 1))} />
        <Text style={styles.hours}>{hours}h</Text>
        <Button title="+" onPress={() => setHours((h) => h + 1)} />
      </View>
      <Button title="Get price" onPress={fetchQuote} />
      {quote ? (
        <View style={styles.card}>
          <PriceTag paise={quote.amountPaise} label="Total" />
          <Button title="Confirm parking" onPress={book} />
        </View>
      ) : null}
      {booking ? <Text style={styles.status}>Booked · {booking.status}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Back to map" onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  dim: { color: '#6b7280' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hours: { fontSize: 18, fontWeight: '600' },
  card: { gap: 8, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12 },
  status: { fontWeight: '600' },
  error: { color: '#dc2626' },
});
