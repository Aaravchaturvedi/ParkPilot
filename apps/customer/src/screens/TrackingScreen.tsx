import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import type { Booking, BookingStatus, LatLng } from '../../../../packages/types/src';
import { billedMinutesFor, formatElapsed, runningCostPaise } from '../../../../packages/types/src';
import { cancelBooking, listBookings, payBooking, requestStopOtp, verifyStopOtp } from '../../../../packages/api/src/index';
import { Button, Card, PriceTag, StatusPill } from '../../../../packages/ui/src';
import { ensureSocket, getSocket } from '../../../../packages/mobile/src/socket';

interface DriverPing {
  driverId: string;
  lat: number;
  lng: number;
  at: number;
}

const FALLBACK_RATE = 15000; // ₹150/hr (server is source of truth; this is display-only)

function socketFor(apiURL: string, token: string): ReturnType<typeof ensureSocket> {
  return getSocket() ?? ensureSocket(apiURL, token);
}

// Timer-model trip screen:
// ACCEPTED -> partner on the way; START code appears here, customer reads it
//   to the driver, driver verifies -> timer starts.
// ONGOING  -> live timer + running cost tick from server startedAt.
//   Customer taps End -> STOP code is minted for the partner, partner reads
//   it back, customer types it in -> COMPLETED with final bill -> pay.
export function TrackingScreen({ apiURL, token, bookingId, onDone }: { apiURL: string; token: string; bookingId: string; onDone: () => void }): React.JSX.Element {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [pos, setPos] = useState<LatLng | null>(null);
  const [pings, setPings] = useState(0);
  const [startOtp, setStartOtp] = useState<string | null>(null);
  const [stopCode, setStopCode] = useState('');
  const [stopSent, setStopSent] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const partnerRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const s = socketFor(apiURL, token);
    const load = async (): Promise<void> => {
      try {
        const { bookings } = await listBookings();
        if (cancelled) return;
        const b = bookings.find((x) => x.id === bookingId) ?? null;
        setBooking(b);
        partnerRef.current = b?.partnerId ?? null;
        if (b?.startOtp) setStartOtp((prev) => prev ?? b.startOtp);
        s.emit('booking:join', { bookingId });
        if (b?.partnerId) {
          try {
            const ack = (await s.emitWithAck('tracking:subscribe', { driverId: b.partnerId })) as { last?: LatLng };
            if (ack?.last && !cancelled) setPos(ack.last);
          } catch {
            // non-fatal
          }
        }
      } catch {
        if (!cancelled) setError('Could not load booking.');
      }
    };
    void load();
    const poll = setInterval(() => {
      listBookings()
        .then(({ bookings }) => {
          if (cancelled) return;
          const b = bookings.find((x) => x.id === bookingId) ?? null;
          if (b) {
            setBooking(b);
            partnerRef.current = b.partnerId ?? null;
            if (b.startOtp) setStartOtp((prev) => prev ?? b.startOtp);
          }
        })
        .catch(() => undefined);
    }, 8000);

    const onUpdate = (evt: { booking: Booking }): void => {
      if (cancelled || evt.booking.id !== bookingId) return;
      setBooking(evt.booking);
      partnerRef.current = evt.booking.partnerId ?? null;
      if (evt.booking.startOtp) setStartOtp((prev) => prev ?? evt.booking.startOtp);
      if (evt.booking.partnerId) {
        void s.emitWithAck('tracking:subscribe', { driverId: evt.booking.partnerId }).catch(() => undefined);
      }
    };
    const onAccepted = (evt: { booking: Booking }): void => {
      if (!cancelled && evt.booking.id === bookingId) {
        setBooking(evt.booking);
        partnerRef.current = evt.booking.partnerId ?? null;
        if (evt.booking.partnerId) {
          void s.emitWithAck('tracking:subscribe', { driverId: evt.booking.partnerId }).catch(() => undefined);
        }
      }
    };
    const onStartOtp = (evt: { bookingId: string; otp: string }): void => {
      if (!cancelled && evt.bookingId === bookingId) setStartOtp(evt.otp);
    };
    const onMove = (m: DriverPing): void => {
      if (cancelled) return;
      if (partnerRef.current && m.driverId !== partnerRef.current) return;
      setPos({ lat: m.lat, lng: m.lng });
      setPings((n) => n + 1);
    };
    s.on('booking:updated', onUpdate);
    s.on('booking:accepted', onAccepted);
    s.on('booking:start-otp', onStartOtp);
    s.on('driver:moved', onMove);
    return () => {
      cancelled = true;
      clearInterval(poll);
      s.off('booking:updated', onUpdate);
      s.off('booking:accepted', onAccepted);
      s.off('booking:start-otp', onStartOtp);
      s.off('driver:moved', onMove);
      s.emit('booking:leave', { bookingId });
    };
  }, [apiURL, token, bookingId]);

  // 1s ticker while the timer runs (display only — billing uses server time).
  useEffect(() => {
    if (booking?.status !== 'ONGOING' || !booking.startedAt) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [booking?.status, booking?.startedAt]);

  const status: BookingStatus | undefined = booking?.status;
  const rate = booking?.pricePerHourPaise ?? FALLBACK_RATE;
  const elapsedSec = booking?.startedAt ? Math.max(0, (nowMs - new Date(booking.startedAt).getTime()) / 1000) : 0;
  const running = runningCostPaise(elapsedSec, rate);
  const canPay = booking != null && booking.paymentStatus === 'PENDING' && (status === 'ACCEPTED' || status === 'ONGOING' || status === 'COMPLETED');
  const canCancel = status === 'REQUESTED' || status === 'ACCEPTED';

  const pay = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const { booking: b } = await payBooking(bookingId);
      setBooking(b);
    } catch {
      setError('Mock payment failed — the trip may not be payable yet (wait for accept).');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (): Promise<void> => {
    setBusy(true);
    try {
      const { booking: b } = await cancelBooking(bookingId);
      setBooking(b);
    } catch {
      setError('Cancel failed — the trip may already be completed.');
    } finally {
      setBusy(false);
    }
  };

  const endTrip = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const { booking: b } = await requestStopOtp(bookingId);
      setBooking(b);
      setStopSent(true);
    } catch {
      setError('Could not end trip — timer may not be running.');
    } finally {
      setBusy(false);
    }
  };

  const confirmEnd = async (): Promise<void> => {
    if (stopCode.trim().length !== 4) {
      setError('Enter the 4-digit code your driver gives you.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { booking: b } = await verifyStopOtp(bookingId, stopCode.trim());
      setBooking(b);
      setStopSent(false);
      setStopCode('');
    } catch {
      setError('Wrong or expired code — ask your driver to read it again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Trip {bookingId.slice(0, 8)}</Text>
      {status ? <StatusPill status={status} /> : <Text>Loading…</Text>}

      {status === 'ACCEPTED' ? (
        <Card>
          <Text style={styles.heading}>Driver is on the way</Text>
          {startOtp ? (
            <>
              <Text style={styles.otp}>{startOtp}</Text>
              <Text style={styles.dim}>Read this 4-digit code to your driver when they arrive. The timer starts when they enter it. Valid 10 min.</Text>
            </>
          ) : (
            <Text style={styles.dim}>Your driver hasn't requested the start code yet — it appears here automatically.</Text>
          )}
        </Card>
      ) : null}

      {status === 'ONGOING' && booking?.startedAt ? (
        <Card>
          <Text style={styles.heading}>Timer running</Text>
          <Text style={styles.timer}>{formatElapsed(elapsedSec)}</Text>
          <Text style={styles.dim}>
            Running bill: {(running.amountPaise / 100).toFixed(2)} ({running.billedMinutes} min · 1-hr minimum{booking.estimatedHours ? ` · est ${booking.estimatedHours} hr` : ''})
          </Text>
          <Text>Driver position: {pos ? `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)} (${pings} updates)` : 'waiting for driver…'}</Text>
          {!stopSent ? (
            <Button title={busy ? 'Ending…' : 'End trip'} onPress={endTrip} disabled={busy} />
          ) : (
            <>
              <Text style={styles.dim}>Stop code sent to your driver — ask them to read the 4-digit code back, then confirm:</Text>
              <TextInput style={styles.input} placeholder="4-digit code" keyboardType="numeric" maxLength={4} value={stopCode} onChangeText={setStopCode} />
              <Button title={busy ? 'Confirming…' : 'Confirm end & see bill'} onPress={confirmEnd} disabled={busy} />
            </>
          )}
        </Card>
      ) : null}

      {booking ? <PriceTag paise={booking.amountPaise} label={status === 'COMPLETED' && booking.billedMinutes ? `Final (${booking.billedMinutes} min)` : 'Fare so far'} /> : null}
      <Text>Payment: {booking?.paymentStatus ?? '…'}</Text>
      {status === 'COMPLETED' && booking?.billedMinutes ? (
        <Text style={styles.dim}>
          Billed {booking.billedMinutes} min{booking.estimatedHours ? ` (est was ${booking.estimatedHours} hr)` : ''} · paid {(booking.partnerPayoutPaise / 100).toFixed(2)} goes to driver
        </Text>
      ) : null}
      {canPay && status === 'COMPLETED' ? <Button title={busy ? 'Paying…' : 'Pay now (mock)'} onPress={pay} disabled={busy} /> : null}
      {canCancel ? <Button title={busy ? '…' : 'Cancel trip'} onPress={cancel} disabled={busy} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Back to trips" onPress={onDone} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  heading: { fontSize: 16, fontWeight: '700' },
  otp: { fontSize: 44, fontWeight: '800', textAlign: 'center', letterSpacing: 8 },
  timer: { fontSize: 40, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 12, fontSize: 20, textAlign: 'center', letterSpacing: 4 },
  dim: { color: '#6b7280' },
  error: { color: '#dc2626' },
});
