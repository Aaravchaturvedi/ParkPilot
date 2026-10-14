import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import * as Location from 'expo-location';
import type { Booking } from '../../../../packages/types/src';
import { formatElapsed, runningCostPaise } from '../../../../packages/types/src';
import { completeBooking, listBookings, requestStartOtp, verifyStartOtp } from '../../../../packages/api/src/index';
import { Button, Card, OtpInput, StatusPill } from '../../../../packages/ui/src';
import { usePlaceName } from '../../../../packages/mobile/src/map/geocode';
import { ensureSocket, getSocket } from '../../../../packages/mobile/src/socket';

function sock(apiURL: string, token: string): ReturnType<typeof ensureSocket> {
  return getSocket() ?? ensureSocket(apiURL, token);
}

// Timer-model active ride.
// ACCEPTED: broadcast GPS, drive to the customer, tap "reached" -> the start
//   code is minted for the CUSTOMER APP; customer reads it aloud; partner
//   types it here -> timer starts.
// ONGOING: live timer + running payout tick. When the customer ends the trip
//   a STOP code appears here -> partner reads it aloud to the customer, who
//   confirms on their phone -> COMPLETED with final bill.
// Stays MOUNTED across tab switches so GPS keeps broadcasting mid-trip.
export function RideScreen({
  apiURL,
  token,
  bookingId,
  onDone,
  active = true,
}: {
  apiURL: string;
  token: string;
  bookingId: string;
  onDone: () => void;
  active?: boolean;
}): React.JSX.Element {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [points, setPoints] = useState(0);
  const [otpIn, setOtpIn] = useState('');
  const [otpError, setOtpError] = useState(false);
  const [startSent, setStartSent] = useState(false);
  const [stopOtp, setStopOtp] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const watcher = useRef<{ remove(): void } | null>(null);
  const lastSent = useRef(0);
  const customerPlace = usePlaceName(booking?.pickupLat, booking?.pickupLng);

  useEffect(() => {
    let cancelled = false;
    listBookings()
      .then(({ bookings }) => {
        if (cancelled) return;
        const b = bookings.find((x) => x.id === bookingId) ?? null;
        setBooking(b);
        if (b?.endOtp) setStopOtp((prev) => prev ?? b.endOtp);
      })
      .catch(() => undefined);
    const s = sock(apiURL, token);
    s.emit('booking:join', { bookingId });
    const onUpdate = (evt: { booking: Booking }): void => {
      if (cancelled || evt.booking.id !== bookingId) return;
      setBooking(evt.booking);
      if (evt.booking.endOtp) setStopOtp((prev) => prev ?? evt.booking.endOtp);
    };
    const onStopOtp = (evt: { bookingId: string; otp: string }): void => {
      if (!cancelled && evt.bookingId === bookingId) setStopOtp(evt.otp);
    };
    s.on('booking:updated', onUpdate);
    s.on('booking:stop-otp', onStopOtp);
    const poll = setInterval(() => {
      listBookings()
        .then(({ bookings }) => {
          if (cancelled) return;
          const b = bookings.find((x) => x.id === bookingId);
          if (b) {
            setBooking(b);
            if (b.endOtp) setStopOtp((prev) => prev ?? b.endOtp);
          }
        })
        .catch(() => undefined);
    }, 8000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      s.off('booking:updated', onUpdate);
      s.off('booking:stop-otp', onStopOtp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  // 1s ticker while the timer runs (display only — billing uses server time).
  useEffect(() => {
    if (booking?.status !== 'ONGOING' || !booking.startedAt) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [booking?.status, booking?.startedAt]);

  // Stop GPS only on unmount (logout) — NOT on tab switch.
  useEffect(() => {
    return () => {
      watcher.current?.remove();
    };
  }, []);

  const start = async (): Promise<void> => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      setError('Location permission denied.');
      return;
    }
    const s = sock(apiURL, token);
    try {
      watcher.current?.remove();
    } catch {
      // ignore
    }
    watcher.current = await Location.watchPositionAsync({ distanceInterval: 5 }, (loc) => {
      const now = Date.now();
      if (now - lastSent.current < 2000) return; // throttle to ~0.5Hz
      lastSent.current = now;
      try {
        s.emit('driver:location', { lat: loc.coords.latitude, lng: loc.coords.longitude }, () => setPoints((n) => n + 1));
      } catch {
        // next tick retries
      }
    });
    setBroadcasting(true);
  };

  const stop = (): void => {
    try {
      watcher.current?.remove();
    } catch {
      // ignore
    }
    watcher.current = null;
    setBroadcasting(false);
  };

  const sendStartCode = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const { booking: b } = await requestStartOtp(bookingId);
      setBooking(b);
      setStartSent(true);
    } catch {
      setError('Could not send code — the trip may already be started.');
    } finally {
      setBusy(false);
    }
  };

  const verifyStart = async (): Promise<void> => {
    if (otpIn.trim().length !== 4) {
      setError('Enter the 4-digit code your customer reads to you.');
      setOtpError(true);
      return;
    }
    setBusy(true);
    setError(null);
    setOtpError(false);
    try {
      const { booking: b } = await verifyStartOtp(bookingId, otpIn.trim());
      setBooking(b);
      setStartSent(false);
      setOtpIn('');
    } catch {
      setError('Wrong or expired code — ask the customer to read it again (resend if needed).');
      setOtpError(true);
    } finally {
      setBusy(false);
    }
  };

  const complete = async (): Promise<void> => {
    // Safety net only: the normal end is the customer's stop-OTP verify.
    // Completing here closes a stuck trip without a final timer bill.
    setBusy(true);
    setError(null);
    try {
      stop();
      const { booking: b } = await completeBooking(bookingId);
      setBooking(b);
    } catch {
      setError('Complete failed.');
    } finally {
      setBusy(false);
    }
  };

  const rate = booking?.pricePerHourPaise ?? 15000;
  const elapsedSec = booking?.startedAt ? Math.max(0, (nowMs - new Date(booking.startedAt).getTime()) / 1000) : 0;
  const running = runningCostPaise(elapsedSec, rate);
  const runningPayout = Math.round((running.amountPaise * (booking?.commissionBps ?? 2000)) / 10000);
  const myPayoutSoFar = running.amountPaise - runningPayout;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Ride {bookingId.slice(0, 8)}</Text>
      {!active ? <Text style={styles.dim}>Running in background — GPS keeps broadcasting.</Text> : null}
      {booking ? <StatusPill status={booking.status} /> : <Text>Loading…</Text>}
      {booking?.estimatedHours ? (
        <Text style={styles.dim}>Customer estimate: {booking.estimatedHours} hr · ₹{(rate / 100).toFixed(0)}/hr fixed</Text>
      ) : null}
      {booking && (booking.pickupLat != null && booking.pickupLng != null) ? (
        <Text style={styles.dim}>Customer location: {customerPlace}</Text>
      ) : null}

      <Card>
        <Text>GPS broadcast: {broadcasting ? `ON (${points} points sent)` : 'OFF'}</Text>
        <Text style={styles.dim}>Drive to the customer — they track you live.</Text>
        {broadcasting ? <Button title="Stop broadcast" onPress={stop} /> : <Button title="Start broadcast" onPress={start} />}
      </Card>

      {booking?.status === 'ACCEPTED' ? (
        <Card>
          <Text style={styles.heading}>Start the timer at the customer</Text>
          {!startSent ? (
            <Button title={busy ? 'Sending…' : 'Reached customer — send start code'} onPress={sendStartCode} disabled={busy} />
          ) : (
            <>
              <Text style={styles.dim}>Code sent to the customer's phone — ask them to read the 4-digit code, then verify:</Text>
              <OtpInput value={otpIn} onChange={(v) => { setOtpIn(v); setOtpError(false); }} error={otpError} label="Customer's code" />
              <Button title={busy ? 'Verifying…' : 'Verify & start timer'} onPress={verifyStart} disabled={busy} />
              <Button title="Resend code" onPress={sendStartCode} disabled={busy} />
            </>
          )}
        </Card>
      ) : null}

      {booking?.status === 'ONGOING' && booking.startedAt ? (
        <Card>
          <Text style={styles.heading}>Timer running</Text>
          <Text style={styles.timer}>{formatElapsed(elapsedSec)}</Text>
          <Text style={styles.dim}>
            Your payout so far ≈ {(myPayoutSoFar / 100).toFixed(2)} ({running.billedMinutes} min billed · 1-hr minimum)
          </Text>
          {stopOtp ? (
            <>
              <Text style={styles.otp}>{stopOtp}</Text>
              <Text style={styles.dim}>Customer is ending the trip — read this 4-digit code TO them. They confirm on their phone; the final bill lands automatically.</Text>
            </>
          ) : (
            <Text style={styles.dim}>Waiting for the customer to end the trip — the stop code appears here automatically.</Text>
          )}
        </Card>
      ) : null}

      {booking ? (
        <Card>
          <Text>
            Payout {(booking.partnerPayoutPaise / 100).toFixed(2)} · payment {booking.paymentStatus}
          </Text>
          {booking.status === 'COMPLETED' && booking.billedMinutes ? (
            <Text style={styles.dim}>Final: billed {booking.billedMinutes} min — earnings land in Wallet.</Text>
          ) : booking.status !== 'CANCELLED' ? (
            <Button title={busy ? '…' : 'Force-close trip (no timer bill)'} onPress={complete} disabled={busy} />
          ) : null}
        </Card>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Back to requests" onPress={onDone} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  heading: { fontSize: 16, fontWeight: '700' },
  dim: { color: '#6b7280' },
  timer: { fontSize: 40, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  otp: { fontSize: 44, fontWeight: '800', textAlign: 'center', letterSpacing: 8 },
  error: { color: '#dc2626' },
});
