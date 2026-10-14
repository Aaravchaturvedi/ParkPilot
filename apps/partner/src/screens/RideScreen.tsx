import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import type { Booking } from '../../../../packages/types/src';
import { formatElapsed, runningCostPaise } from '../../../../packages/types/src';
import { completeBooking, listBookings, requestStartOtp, verifyStartOtp } from '../../../../packages/api/src/index';
import { AppHeader, Button, Card, OtpInput, PriceTag, Screen, SectionLabel, StatusPill } from '../../../../packages/ui/src';
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
  const step = !booking ? 0 : booking.status === 'ACCEPTED' ? 1 : booking.status === 'ONGOING' ? 2 : 3;

  return (
    <Screen>
      <AppHeader
        title={`Ride ${bookingId.slice(0, 8)}`}
        subtitle={booking?.estimatedHours ? `${booking.estimatedHours} hr est · ₹${(rate / 100).toFixed(0)}/hr` : 'Active ride'}
        right={booking ? <StatusPill status={booking.status} /> : undefined}
      />
      {!active ? <Text style={styles.dim}>Running in background — GPS keeps broadcasting.</Text> : null}
      {booking && (booking.pickupLat != null && booking.pickupLng != null) ? (
        <Text style={styles.dim}>Customer at {customerPlace}</Text>
      ) : null}
      <Steps current={step} />

      <SectionLabel>Your location</SectionLabel>
      <Card style={broadcasting ? styles.liveBorder : undefined}>
        <View style={styles.split}>
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>Broadcast {broadcasting ? 'on' : 'off'}</Text>
            <Text style={styles.dim}>{broadcasting ? `${points} points sent — customer tracks you live` : 'Customer cannot see you until this is on.'}</Text>
          </View>
          <View style={[styles.dot, broadcasting ? styles.dotOn : styles.dotOff]} />
        </View>
        {broadcasting
          ? <Button title="Stop broadcast" variant="secondary" onPress={stop} />
          : <Button title="Start broadcast" block onPress={start} />}
      </Card>

      {booking?.status === 'ACCEPTED' ? (
        <>
          <SectionLabel>Start the timer</SectionLabel>
          <Card style={styles.hero}>
            {!startSent ? (
              <>
                <Text style={styles.dim}>Standing with the customer? Send the code to their phone, have them read it back, verify below.</Text>
                <Button title="Reached customer — send code" block loading={busy} onPress={sendStartCode} disabled={busy} />
              </>
            ) : (
              <>
                <Text style={styles.dim}>Code is on the customer's phone — type what they read out:</Text>
                <OtpInput value={otpIn} onChange={(v) => { setOtpIn(v); setOtpError(false); }} error={otpError} />
                <Button title="Verify & start timer" block loading={busy} onPress={verifyStart} disabled={busy} />
                <Button title="Resend code" variant="ghost" onPress={sendStartCode} disabled={busy} />
              </>
            )}
          </Card>
        </>
      ) : null}

      {booking?.status === 'ONGOING' && booking.startedAt ? (
        <>
          <SectionLabel>Timer</SectionLabel>
          <Card style={styles.hero}>
            <Text style={styles.timer}>{formatElapsed(elapsedSec)}</Text>
            <PriceTag paise={myPayoutSoFar} label="Your payout so far ≈" />
            <Text style={styles.dim}>{running.billedMinutes} min billed · 1-hr minimum</Text>
            {stopOtp ? (
              <>
                <Text style={styles.otp}>{stopOtp}</Text>
                <Text style={styles.dim}>Read this code TO the customer — they confirm on their phone and the final bill lands automatically.</Text>
              </>
            ) : (
              <Text style={styles.dim}>Waiting for the customer to end the trip — the stop code appears here automatically.</Text>
            )}
          </Card>
        </>
      ) : null}

      {booking ? (
        <>
          <SectionLabel>Bill</SectionLabel>
          <Card>
            <View style={styles.split}>
              <Text style={styles.dim}>Payout · {booking.paymentStatus.toLowerCase()}</Text>
              <PriceTag paise={booking.partnerPayoutPaise} label="" />
            </View>
            {booking.status === 'COMPLETED' && booking.billedMinutes ? (
              <Text style={styles.dim}>Final: billed {booking.billedMinutes} min — earnings land in Wallet.</Text>
            ) : booking.status !== 'CANCELLED' ? (
              <Button title="Force-close trip" variant="secondary" small onPress={complete} disabled={busy} />
            ) : null}
          </Card>
        </>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Back to requests" variant="ghost" onPress={onDone} />
    </Screen>
  );
}

// 1 Reached → 2 Timer → 3 Bill. Pure presentational progress.
function Steps({ current }: { current: number }): React.JSX.Element {
  const labels = ['Reached', 'Timer', 'Bill'];
  return (
    <View style={styles.steps}>
      {labels.map((l, i) => {
        const n = i + 1;
        const done = n < current || current === 3;
        const now = n === current && current < 3;
        return (
          <View key={l} style={styles.step}>
            <View style={[styles.bubble, done && styles.bubbleDone, now && styles.bubbleNow]}>
              <Text style={[styles.bubbleText, (done || now) && styles.bubbleTextOn]}>{done ? '✓' : n}</Text>
            </View>
            <Text style={[styles.stepLabel, (done || now) && styles.stepLabelOn]}>{l}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { color: '#6b7280', fontSize: 13 },
  split: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#d1d5db' },
  dotOn: { backgroundColor: '#16a34a' },
  dotOff: { backgroundColor: '#d1d5db' },
  liveBorder: { borderColor: '#16a34a', borderWidth: 1.5 },
  hero: { alignItems: 'center', borderColor: '#4f46e5', borderWidth: 1.5 },
  timer: { fontSize: 48, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'], color: '#111827' },
  otp: { fontSize: 48, fontWeight: '800', textAlign: 'center', letterSpacing: 10, color: '#111827' },
  steps: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 4 },
  step: { alignItems: 'center', gap: 4 },
  bubble: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  bubbleDone: { backgroundColor: '#16a34a' },
  bubbleNow: { backgroundColor: '#4f46e5' },
  bubbleText: { fontWeight: '800', color: '#6b7280' },
  bubbleTextOn: { color: '#fff' },
  stepLabel: { fontSize: 12, color: '#9ca3af', fontWeight: '600' },
  stepLabelOn: { color: '#111827', fontWeight: '700' },
  error: { color: '#dc2626' },
});
