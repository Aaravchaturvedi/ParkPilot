import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Booking } from '../../../../packages/types/src';
import { Button, Card, StatusPill } from '../../../../packages/ui/src';
import { connectSocket, getSocket } from '../../../../packages/mobile/src/socket';

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
}

// Inbox is fed by the App-level socket listener, so requests arrive no
// matter which tab is open. This screen only accepts/rejects.
export function RequestsScreen({ apiURL, token, online, setOnline, incoming, setIncoming, onActive }: Props): React.JSX.Element {
  const [active, setActive] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accept = async (id: string): Promise<void> => {
    const ack = (await connectSocket(apiURL, token).emitWithAck('booking:accept', { bookingId: id })) as { ok: boolean; error?: string; booking?: Booking };
    if (!ack.ok) {
      setError(ack.error ?? 'Accept failed');
      return;
    }
    setIncoming((list) => list.filter((i) => i.booking.id !== id));
    if (ack.booking) {
      setActive(ack.booking);
      onActive(ack.booking.id);
    }
  };

  const reject = async (id: string): Promise<void> => {
    await connectSocket(apiURL, token).emitWithAck('booking:reject', { bookingId: id });
    setIncoming((list) => list.filter((i) => i.booking.id !== id));
  };

  return (
    <View style={styles.root}>
      <Button
        title={online ? 'Go offline' : 'Go online'}
        onPress={() => {
          if (online) (getSocket() ?? connectSocket(apiURL, token)).emit('partner:offline', {});
          setOnline(!online);
        }}
      />
      {active ? (
        <Card>
          <Text style={styles.title}>Active ride</Text>
          <StatusPill status={active.status} />
          <Text style={styles.dim}>{active.id.slice(0, 8)} · Day 17 ride screen takes over here.</Text>
        </Card>
      ) : null}
      <Text style={styles.title}>Requests ({online ? 'online' : 'offline'})</Text>
      {incoming.length === 0 ? <Text style={styles.dim}>No requests yet.</Text> : null}
      {incoming.map(({ booking }) => (
        <Card key={booking.id}>
          <Text style={styles.title}>
            {booking.type} · {(booking.amountPaise / 100).toFixed(2)}
          </Text>
          <Text style={styles.dim}>
            {booking.id.slice(0, 8)}
            {booking.distanceKm ? ` · ${booking.distanceKm} km` : ''}
          </Text>
          <View style={styles.row}>
            <Button title="Accept" onPress={() => accept(booking.id)} />
            <Button title="Reject" onPress={() => reject(booking.id)} />
          </View>
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
  row: { flexDirection: 'row', gap: 12 },
  error: { color: '#dc2626' },
});
