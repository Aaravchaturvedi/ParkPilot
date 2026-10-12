import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import type { Booking } from '../../../../packages/types/src';
import { completeBooking, listBookings } from '../../../../packages/api/src/index';
import { Button, Card, StatusPill } from '../../../../packages/ui/src';
import { connectSocket } from '../../../../packages/mobile/src/socket';

// Active ride: broadcasts GPS via driver:location (~2s throttle) and
// completes the booking. Foreground watch; background mode is Phase A.
export function RideScreen({ apiURL, token, bookingId, onDone }: { apiURL: string; token: string; bookingId: string; onDone: () => void }): React.JSX.Element {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [points, setPoints] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const watcher = useRef<{ remove(): void } | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    (async () => {
      const { bookings } = await listBookings();
      setBooking(bookings.find((b) => b.id === bookingId) ?? null);
    })();
    return () => {
      watcher.current?.remove();
    };
  }, [bookingId]);

  const start = async (): Promise<void> => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      setError('Location permission denied.');
      return;
    }
    const s = connectSocket(apiURL, token);
    watcher.current = await Location.watchPositionAsync({ distanceInterval: 5 }, (loc) => {
      const now = Date.now();
      if (now - lastSent.current < 2000) return; // throttle to ~0.5Hz
      lastSent.current = now;
      s.emit('driver:location', { lat: loc.coords.latitude, lng: loc.coords.longitude }, () => setPoints((n) => n + 1));
    });
    setBroadcasting(true);
  };

  const stop = (): void => {
    watcher.current?.remove();
    watcher.current = null;
    setBroadcasting(false);
  };

  const complete = async (): Promise<void> => {
    try {
      stop();
      const { booking: b } = await completeBooking(bookingId);
      setBooking(b);
    } catch {
      setError('Complete failed.');
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Ride {bookingId.slice(0, 8)}</Text>
      {booking ? <StatusPill status={booking.status} /> : null}
      <Card>
        <Text>GPS broadcast: {broadcasting ? `ON (${points} points sent)` : 'OFF'}</Text>
        {broadcasting ? <Button title="Stop broadcast" onPress={stop} /> : <Button title="Start broadcast" onPress={start} />}
      </Card>
      {booking ? (
        <Card>
          <Text>
            Payout {(booking.partnerPayoutPaise / 100).toFixed(2)} · payment {booking.paymentStatus}
          </Text>
          {booking.status !== 'COMPLETED' ? <Button title="Complete ride" onPress={complete} /> : null}
        </Card>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Back to requests" onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  error: { color: '#dc2626' },
});
