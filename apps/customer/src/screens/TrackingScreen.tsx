import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import { SafeMapView } from '../../../../packages/mobile/src/map/SafeMap';
import { usePlaceName } from '../../../../packages/mobile/src/map/geocode';
import type { Booking, BookingStatus, LatLng } from '../../../../packages/types/src';
import { formatElapsed, runningCostPaise } from '../../../../packages/types/src';
import { cancelBooking, listBookings, payBooking, requestStopOtp, verifyStopOtp } from '../../../../packages/api/src/index';
import { AppHeader, Button, Card, OtpInput, PriceTag, Screen, SectionLabel, StatusPill } from '../../../../packages/ui/src';
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
  const [otpError, setOtpError] = useState(false);
  const [stopSent, setStopSent] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [frame, setFrame] = useState(0);
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationMin: number } | null>(null);
  const partnerRef = useRef<string | null>(null);
  const pickupPlace = usePlaceName(booking?.pickupLat, booking?.pickupLng);

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

  const pickup = booking && booking.pickupLat != null && booking.pickupLng != null
    ? { lat: booking.pickupLat, lng: booking.pickupLng }
    : null;
  const showLiveMap = (status === 'ACCEPTED' || status === 'ONGOING') && pickup !== null;
  const mapRegion = pos && pickup
    ? {
        latitude: (pos.lat + pickup.lat) / 2,
        longitude: (pos.lng + pickup.lng) / 2,
        latitudeDelta: Math.max(0.03, Math.abs(pos.lat - pickup.lat) * 2.4 + 0.01),
        longitudeDelta: Math.max(0.03, Math.abs(pos.lng - pickup.lng) * 2.4 + 0.01),
      }
    : pickup
      ? { latitude: pickup.lat, longitude: pickup.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }
      : { latitude: 28.6139, longitude: 77.209, latitudeDelta: 0.05, longitudeDelta: 0.05 };

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
      setOtpError(true);
      return;
    }
    setBusy(true);
    setError(null);
    setOtpError(false);
    try {
      const { booking: b } = await verifyStopOtp(bookingId, stopCode.trim());
      setBooking(b);
      setStopSent(false);
      setStopCode('');
    } catch {
      setError('Wrong or expired code — ask your driver to read it again.');
      setOtpError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppHeader
        title={`Trip ${bookingId.slice(0, 8)}`}
        subtitle={booking?.estimatedHours ? `Estimate ${booking.estimatedHours} hr · ₹${(rate / 100).toFixed(0)}/hr` : 'Live trip'}
        right={status ? <StatusPill status={status} /> : undefined}
      />

      {status === 'ACCEPTED' ? (
        <Card style={styles.hero}>
          <Text style={styles.heroKicker}>Driver is on the way</Text>
          {startOtp ? (
            <>
              <Text style={styles.otp}>{startOtp}</Text>
              <Text style={styles.dim}>Read this code to your driver on arrival — the timer starts on verify. Valid 10 min.</Text>
            </>
          ) : (
            <Text style={styles.dim}>The start code appears here the moment your driver requests it.</Text>
          )}
        </Card>
      ) : null}

      {showLiveMap && pickup ? (
        <>
          <SectionLabel>Live location</SectionLabel>
          <Card style={styles.mapCard}>
            <SafeMapView
              key={`trk-${pos ? 'live' : 'wait'}-${frame}`}
              initialRegion={mapRegion}
              style={styles.map}
              route={pos ? { from: { latitude: pos.lat, longitude: pos.lng }, to: { latitude: pickup.lat, longitude: pickup.lng } } : null}
              onRouteInfo={setRouteInfo}
            >
              <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} title="Pickup (you)" pinColor="green" />
              {pos ? <Marker coordinate={{ latitude: pos.lat, longitude: pos.lng }} title="Driver" pinColor="blue" /> : null}
            </SafeMapView>
            <Text style={styles.dim}>
              Pickup: {pickupPlace}
              {pos ? (routeInfo ? ` · driver ${routeInfo.distanceKm.toFixed(1)} km away (~${Math.max(1, Math.round(routeInfo.durationMin))} min)` : ` · driver located (${pings} updates)`) : ' · waiting for driver broadcast…'}
            </Text>
            {pos ? <Button title="Recenter" variant="secondary" small onPress={() => setFrame((n) => n + 1)} /> : null}
          </Card>
        </>
      ) : null}

      {status === 'ONGOING' && booking?.startedAt ? (
        <>
          <SectionLabel>Timer</SectionLabel>
          <Card style={styles.hero}>
            <Text style={styles.timer}>{formatElapsed(elapsedSec)}</Text>
            <PriceTag paise={running.amountPaise} label="Running" />
            <Text style={styles.dim}>{running.billedMinutes} min billed · 1-hr minimum{booking.estimatedHours ? ` · est ${booking.estimatedHours} hr` : ''}</Text>
            {!stopSent ? (
              <Button title="End trip" block loading={busy} onPress={endTrip} disabled={busy} />
            ) : (
              <>
                <Text style={styles.dim}>Stop code sent to your driver — type the 4-digit code they read back:</Text>
                <OtpInput value={stopCode} onChange={(v) => { setStopCode(v); setOtpError(false); }} error={otpError} />
                <Button title="Confirm end & see bill" block loading={busy} onPress={confirmEnd} disabled={busy} />
              </>
            )}
          </Card>
        </>
      ) : null}

      <SectionLabel>Bill</SectionLabel>
      <Card>
        {booking ? <PriceTag paise={booking.amountPaise} label={status === 'COMPLETED' && booking.billedMinutes ? `Final · ${booking.billedMinutes} min` : 'So far'} /> : null}
        <Text style={styles.dim}>Payment: {booking?.paymentStatus ?? '…'}</Text>
        {status === 'COMPLETED' && booking?.billedMinutes ? (
          <Text style={styles.dim}>Billed {booking.billedMinutes} min · {(booking.partnerPayoutPaise / 100).toFixed(2)} goes to the driver</Text>
        ) : null}
        {canPay && status === 'COMPLETED' ? <Button title="Pay now (mock)" block loading={busy} onPress={pay} disabled={busy} /> : null}
        {canCancel ? <Button title="Cancel trip" variant="secondary" onPress={cancel} disabled={busy} /> : null}
      </Card>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Back to trips" variant="ghost" onPress={onDone} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  dim: { color: '#6b7280', fontSize: 13 },
  hero: { alignItems: 'center', borderColor: '#4f46e5', borderWidth: 1.5 },
  heroKicker: { fontSize: 13, fontWeight: '800', color: '#4338ca', textTransform: 'uppercase', letterSpacing: 1 },
  otp: { fontSize: 52, fontWeight: '800', letterSpacing: 10, color: '#111827' },
  timer: { fontSize: 48, fontWeight: '800', fontVariant: ['tabular-nums'], color: '#111827' },
  mapCard: { padding: 8, gap: 8 },
  map: { height: 240, borderRadius: 12 },
  error: { color: '#dc2626' },
});
