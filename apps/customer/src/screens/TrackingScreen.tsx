import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Booking, BookingStatus, LatLng } from '../../../../packages/types/src';
import { listBookings, payBooking } from '../../../../packages/api/src/index';
import { Button, Card, PriceTag, StatusPill } from '../../../../packages/ui/src';
import { connectSocket } from '../socket';

interface DriverPing {
  driverId: string;
  lat: number;
  lng: number;
  at: number;
}

// Live tracking + mock payment. Closes the customer loop:
// booked -> accepted -> driver moving -> paid.
export function TrackingScreen({ apiURL, token, bookingId, onDone }: { apiURL: string; token: string; bookingId: string; onDone: () => void }): React.JSX.Element {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [pos, setPos] = useState<LatLng | null>(null);
  const [pings, setPings] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = connectSocket(apiURL, token);
    (async () => {
      try {
        const { bookings } = await listBookings();
        const b = bookings.find((x) => x.id === bookingId) ?? null;
        setBooking(b);
        s.emit('booking:join', { bookingId });
        if (b?.partnerId) {
          const ack = (await s.emitWithAck('tracking:subscribe', { driverId: b.partnerId })) as { last?: LatLng };
          if (ack.last) setPos(ack.last);
        }
      } catch {
        setError('Could not load booking.');
      }
    })();
    const onUpdate = (evt: { booking: Booking }): void => {
      setBooking(evt.booking);
      if (evt.booking.partnerId) {
        void s.emitWithAck('tracking:subscribe', { driverId: evt.booking.partnerId });
      }
    };
    const onMove = (m: DriverPing): void => {
      setPos({ lat: m.lat, lng: m.lng });
      setPings((n) => n + 1);
    };
    s.on('booking:updated', onUpdate);
    s.on('driver:moved', onMove);
    return () => {
      s.off('booking:updated', onUpdate);
      s.off('driver:moved', onMove);
    };
  }, [apiURL, token, bookingId]);

  const status: BookingStatus | undefined = booking?.status;
  const canPay = booking && booking.paymentStatus === 'PENDING' && (status === 'ACCEPTED' || status === 'ONGOING');

  const pay = async (): Promise<void> => {
    try {
      const { booking: b } = await payBooking(bookingId);
      setBooking(b);
    } catch {
      setError('Mock payment failed.');
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Trip {bookingId.slice(0, 8)}</Text>
      {status ? <StatusPill status={status} /> : null}
      <Text>Driver position: {pos ? `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)} (${pings} updates)` : 'waiting for driver…'}</Text>
      {booking ? <PriceTag paise={booking.amountPaise} label="Fare" /> : null}
      <Text>Payment: {booking?.paymentStatus ?? '…'}</Text>
      {canPay ? <Button title="Pay now (mock)" onPress={pay} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Back" onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  status: { fontSize: 16, fontWeight: '600' },
  error: { color: '#dc2626' },
});
