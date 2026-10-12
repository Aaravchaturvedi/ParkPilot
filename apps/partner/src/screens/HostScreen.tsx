import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Booking, ParkingSpace } from '../../../../packages/types/src';
import { createSpace, listBookings, mySpaces, updateSpace, acceptBooking } from '../../../../packages/api/src/index';
import { Button, Card, Field, StatusPill } from '../../../../packages/ui/src';

// Host flow: list spaces, add a space, toggle availability,
// accept incoming parking bookings on own spaces.
export function HostScreen(): React.JSX.Element {
  const [spaces, setSpaces] = useState<ParkingSpace[]>([]);
  const [incoming, setIncoming] = useState<Booking[]>([]);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('80');
  const [error, setError] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    try {
      const [s, b] = await Promise.all([mySpaces(), listBookings()]);
      setSpaces(s.spaces);
      setIncoming(b.bookings.filter((x) => x.type === 'PARKING' && x.status === 'REQUESTED'));
    } catch {
      setError('Load failed.');
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const add = async (): Promise<void> => {
    try {
      // MVP: fixed demo coords (Connaught Place). Geo-tagged capture is Phase B.
      await createSpace({ title: title.trim(), address: 'New Delhi', lat: 28.6315, lng: 77.2167, pricePerHourPaise: Number(price) * 100 });
      setTitle('');
      await refresh();
    } catch {
      setError('Create failed — check title and price.');
    }
  };

  const toggle = async (s: ParkingSpace): Promise<void> => {
    await updateSpace(s.id, { isActive: !s.isActive });
    await refresh();
  };

  const accept = async (id: string): Promise<void> => {
    await acceptBooking(id);
    await refresh();
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>My spaces ({spaces.length})</Text>
      <Card>
        <Field label="Title" placeholder="Basement slot A1" value={title} onChangeText={setTitle} />
        <Field label="Price/hr (₹)" placeholder="80" keyboardType="numeric" value={price} onChangeText={setPrice} />
        <Button title="List space" onPress={add} />
      </Card>
      {spaces.map((s) => (
        <Card key={s.id}>
          <Text style={styles.title}>{s.title}</Text>
          <Text style={styles.dim}>
            ₹{(s.pricePerHourPaise / 100).toFixed(0)}/hr · {s.isActive ? 'live' : 'paused'}
          </Text>
          <Button title={s.isActive ? 'Pause' : 'Activate'} onPress={() => toggle(s)} />
        </Card>
      ))}
      <Text style={styles.title}>Parking requests ({incoming.length})</Text>
      {incoming.map((b) => (
        <Card key={b.id}>
          <StatusPill status={b.status} />
          <Text style={styles.dim}>
            {b.id.slice(0, 8)} · {(b.amountPaise / 100).toFixed(2)}
          </Text>
          <Button title="Accept" onPress={() => accept(b.id)} />
        </Card>
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  dim: { color: '#6b7280' },
  error: { color: '#dc2626' },
});
