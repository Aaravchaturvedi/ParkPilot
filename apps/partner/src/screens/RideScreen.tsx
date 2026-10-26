import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Linking, Alert } from 'react-native';
import * as Location from 'expo-location';
import type { Booking } from '../../../../packages/types/src';
import { formatElapsed, runningCostPaise } from '../../../../packages/types/src';
import { completeBooking, listBookings, requestStartOtp, verifyStartOtp } from '../../../../packages/api/src/index';
import { AppHeader, Button, Card, OtpInput, PriceTag, Screen, SectionLabel, StatusPill } from '../../../../packages/ui/src';
import { Ionicons } from '@expo/vector-icons';
import { usePlaceName } from '../../../../packages/mobile/src/map/geocode';
import { ensureSocket, getSocket } from '../../../../packages/mobile/src/socket';
import { Marker, SafeMapView } from '../../../../packages/mobile/src/map/SafeMap';
import { PartnerPaymentModal } from '../components/PartnerPaymentModal';

function sock(apiURL: string, token: string): ReturnType<typeof ensureSocket> {
  return getSocket() ?? ensureSocket(apiURL, token);
}

// Active ride screen for partners.
// Features:
// - Automatic GPS broadcasting as soon as ride is accepted (no manual toggle required).
// - Interactive live map showing partner location, customer pickup location, and driving route.
// - Real-time distance and driving ETA to reach the customer.
// - Step-by-step ride flow: Reached -> Start OTP -> Live Timer -> Stop OTP -> Bill.
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
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [points, setPoints] = useState(0);
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationMin: number } | null>(null);
  const [frame, setFrame] = useState(0);
  const [otpIn, setOtpIn] = useState('');
  const [otpError, setOtpError] = useState(false);
  const [startSent, setStartSent] = useState(false);
  const [stopOtp, setStopOtp] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const watcher = useRef<{ remove(): void } | null>(null);
  const lastSent = useRef(0);

  const customerLoc = useMemo(() => {
    if (booking && booking.pickupLat != null && booking.pickupLng != null) {
      return { lat: booking.pickupLat, lng: booking.pickupLng };
    }
    return null;
  }, [booking?.pickupLat, booking?.pickupLng]);

  const customerPlace = usePlaceName(customerLoc?.lat, customerLoc?.lng);

  const cancelAlertFired = useRef(false);
  const handleCancelled = (): void => {
    if (cancelAlertFired.current) return;
    cancelAlertFired.current = true;
    stopGpsBroadcast();
    Alert.alert(
      'Ride Cancelled',
      'The customer has cancelled this ride request.',
      [
        {
          text: 'OK',
          onPress: onDone,
        },
      ],
      { cancelable: false }
    );
  };

  useEffect(() => {
    let cancelled = false;
    listBookings()
      .then(({ bookings }) => {
        if (cancelled) return;
        const b = bookings.find((x) => x.id === bookingId) ?? null;
        if (b?.status === 'CANCELLED') {
          handleCancelled();
          return;
        }
        setBooking(b);
        if (b?.endOtp) setStopOtp((prev) => prev ?? b.endOtp);
      })
      .catch(() => undefined);
    const s = sock(apiURL, token);
    s.emit('booking:join', { bookingId });
    const onUpdate = (evt: { booking: Booking }): void => {
      if (cancelled || evt.booking.id !== bookingId) return;
      if (evt.booking.status === 'CANCELLED') {
        handleCancelled();
        return;
      }
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
            if (b.status === 'CANCELLED') {
              handleCancelled();
              return;
            }
            setBooking(b);
            if (b.endOtp) setStopOtp((prev) => prev ?? b.endOtp);
          }
        })
        .catch(() => undefined);
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      s.off('booking:updated', onUpdate);
      s.off('booking:stop-otp', onStopOtp);
    };
  }, [apiURL, token, bookingId]);

  // 1s ticker while the timer runs (display only — billing uses server time).
  useEffect(() => {
    if (booking?.status !== 'ONGOING' || !booking.startedAt) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [booking?.status, booking?.startedAt]);

  const startGpsBroadcast = async (): Promise<void> => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setError('Location permission denied — enable GPS in settings.');
        return;
      }
      const s = sock(apiURL, token);
      try {
        watcher.current?.remove();
      } catch {
        // ignore
      }

      // Immediate position snapshot
      try {
        const init = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (init) {
          const coords = { lat: init.coords.latitude, lng: init.coords.longitude };
          setMyLoc(coords);
          s.emit('driver:location', coords, () => setPoints((n) => n + 1));
          lastSent.current = Date.now();
        }
      } catch {
        // non-fatal, watchPositionAsync will supply positions
      }

      // Continuous GPS watcher
      watcher.current = await Location.watchPositionAsync(
        { distanceInterval: 5, accuracy: Location.Accuracy.High },
        (loc) => {
          const lat = loc.coords.latitude;
          const lng = loc.coords.longitude;
          setMyLoc({ lat, lng });

          const now = Date.now();
          if (now - lastSent.current < 2000) return; // throttle to ~0.5Hz
          lastSent.current = now;
          try {
            s.emit('driver:location', { lat, lng }, () => setPoints((n) => n + 1));
          } catch {
            // next tick retries
          }
        }
      );
      setBroadcasting(true);
    } catch {
      setError('Could not start GPS tracking.');
    }
  };

  const stopGpsBroadcast = (): void => {
    try {
      watcher.current?.remove();
    } catch {
      // ignore
    }
    watcher.current = null;
    setBroadcasting(false);
  };

  // Automatically start broadcasting GPS once ride is ACCEPTED or ONGOING
  useEffect(() => {
    const isLive = booking?.status === 'ACCEPTED' || booking?.status === 'ONGOING';
    if (isLive && !watcher.current) {
      void startGpsBroadcast();
    } else if (!isLive && watcher.current) {
      stopGpsBroadcast();
    }
  }, [booking?.status]);

  // Clean up watcher on unmount
  useEffect(() => {
    return () => {
      stopGpsBroadcast();
    };
  }, []);

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
    setBusy(true);
    setError(null);
    try {
      stopGpsBroadcast();
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

  const mapRegion = useMemo(() => {
    if (myLoc && customerLoc) {
      return {
        latitude: (myLoc.lat + customerLoc.lat) / 2,
        longitude: (myLoc.lng + customerLoc.lng) / 2,
        latitudeDelta: Math.max(0.015, Math.abs(myLoc.lat - customerLoc.lat) * 1.5),
        longitudeDelta: Math.max(0.015, Math.abs(myLoc.lng - customerLoc.lng) * 1.5),
      };
    }
    if (customerLoc) {
      return {
        latitude: customerLoc.lat,
        longitude: customerLoc.lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }
    if (myLoc) {
      return {
        latitude: myLoc.lat,
        longitude: myLoc.lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }
    return {
      latitude: 28.6139,
      longitude: 77.209,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }, [customerLoc?.lat, customerLoc?.lng, myLoc?.lat, myLoc?.lng]);

  return (
    <Screen>
      <AppHeader
        title={`Ride ${bookingId.slice(0, 8)}`}
        subtitle={booking?.estimatedHours ? `${booking.estimatedHours} hr est · ₹${(rate / 100).toFixed(0)}/hr` : 'Active ride'}
        right={booking ? <StatusPill status={booking.status} /> : undefined}
      />
      <Steps current={step} />

      {/* Live Map: Partner location + Customer pickup + Driving route */}
      {customerLoc ? (
        <>
          <SectionLabel>{booking?.status === 'ACCEPTED' ? 'Route to customer' : 'Live trip route'}</SectionLabel>
          <Card style={styles.mapCard}>
            <View style={styles.mapHeaderRow}>
              <View style={styles.mapTitleCol}>
                <Text style={styles.mapTitle} numberOfLines={1}>
                  Customer: {customerPlace || `${customerLoc.lat.toFixed(4)}, ${customerLoc.lng.toFixed(4)}`}
                </Text>
                <Text style={styles.dim} numberOfLines={1}>
                  {routeInfo
                    ? `${routeInfo.distanceKm.toFixed(1)} km away · ~${Math.max(1, Math.round(routeInfo.durationMin))} min drive`
                    : myLoc
                    ? 'Calculating driving route…'
                    : 'Acquiring GPS fix…'}
                </Text>
              </View>
              <View style={[styles.livePill, broadcasting ? styles.livePillOn : styles.livePillOff]}>
                <View style={[styles.dot, broadcasting ? styles.dotOn : styles.dotOff]} />
                <Text style={[styles.livePillText, broadcasting ? styles.livePillTextOn : styles.livePillTextOff]}>
                  {broadcasting ? `Live (${points})` : 'GPS…'}
                </Text>
              </View>
            </View>

            <SafeMapView
              key={`ride-map-${frame}`}
              initialRegion={mapRegion}
              center={myLoc ? { latitude: myLoc.lat, longitude: myLoc.lng } : null}
              style={styles.map}
              route={
                myLoc && customerLoc
                  ? {
                      from: { latitude: myLoc.lat, longitude: myLoc.lng },
                      to: { latitude: customerLoc.lat, longitude: customerLoc.lng },
                    }
                  : null
              }
              onRouteInfo={setRouteInfo}
            >
              <Marker
                coordinate={{ latitude: customerLoc.lat, longitude: customerLoc.lng }}
                title="Customer Pickup"
                pinColor="green"
              />
              {myLoc ? (
                <Marker
                  coordinate={{ latitude: myLoc.lat, longitude: myLoc.lng }}
                  title="You (Partner)"
                  pinColor="blue"
                />
              ) : null}
            </SafeMapView>

            <View style={styles.mapFooter}>
              <View style={styles.etaRow}>
                {routeInfo ? (
                  <Ionicons name="car-sport" size={16} color="#000000" style={{ marginRight: 6 }} />
                ) : null}
                <Text style={styles.etaText}>
                  {routeInfo
                    ? `${routeInfo.distanceKm.toFixed(1)} km to pickup · ~${Math.max(1, Math.round(routeInfo.durationMin))} min`
                    : myLoc
                    ? 'Route loaded on map'
                    : 'Broadcasting location'}
                </Text>
              </View>
              <View style={styles.btnRow}>
                <Button title="Recenter" variant="secondary" small onPress={() => setFrame((n) => n + 1)} />
                <Button
                  title="Google Maps"
                  icon={<Ionicons name="open-outline" size={14} color="#111827" />}
                  iconPosition="right"
                  variant="secondary"
                  small
                  onPress={() => {
                    const url = `https://www.google.com/maps/dir/?api=1&destination=${customerLoc.lat},${customerLoc.lng}`;
                    void Linking.openURL(url).catch(() => undefined);
                  }}
                />
              </View>
            </View>
          </Card>
        </>
      ) : null}

      {/* Step 1: Reached customer & OTP flow */}
      {booking?.status === 'ACCEPTED' ? (
        <>
          <SectionLabel>Start trip</SectionLabel>
          <Card style={styles.hero}>
            {!startSent ? (
              <Button title="Reached customer — send OTP" block loading={busy} onPress={sendStartCode} disabled={busy} />
            ) : (
              <>
                <Text style={styles.dim}>Enter the 4-digit code from rider:</Text>
                <OtpInput value={otpIn} onChange={(v) => { setOtpIn(v); setOtpError(false); }} error={otpError} />
                <Button title="Verify & start trip" block loading={busy} onPress={verifyStart} disabled={busy} />
                <Button title="Resend code" variant="ghost" onPress={sendStartCode} disabled={busy} />
              </>
            )}
          </Card>
        </>
      ) : null}

      {/* Step 2: Trip ongoing with live timer */}
      {booking?.status === 'ONGOING' && booking.startedAt ? (
        <>
          <SectionLabel>Timer</SectionLabel>
          <Card style={styles.hero}>
            <Text style={styles.timer}>{formatElapsed(elapsedSec)}</Text>
            <PriceTag paise={myPayoutSoFar} label="Your payout so far ≈" />
            <Text style={styles.dim}>{running.billedMinutes} min billed</Text>
            {stopOtp ? (
              <>
                <Text style={styles.otp}>{stopOtp}</Text>
                <Text style={styles.dim}>Share this code with rider to end trip</Text>
              </>
            ) : null}
          </Card>
        </>
      ) : null}

      {/* Step 3: Bill & summary */}
      {booking ? (
        <>
          <SectionLabel>Payout</SectionLabel>
          <Card>
            <View style={styles.split}>
              <Text style={styles.dim}>Payout · {booking.paymentStatus.toLowerCase()}</Text>
              <PriceTag paise={booking.partnerPayoutPaise} label="" />
            </View>
            {booking.status === 'COMPLETED' && booking.billedMinutes ? (
              <Text style={styles.dim}>Billed {booking.billedMinutes} min</Text>
            ) : booking.status !== 'CANCELLED' ? (
              <Button title="Force-close trip" variant="secondary" small onPress={complete} disabled={busy} />
            ) : null}
          </Card>
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {(!booking || booking.status === 'COMPLETED' || booking.status === 'CANCELLED') ? (
        <Button title="Back to requests" variant="ghost" onPress={onDone} />
      ) : null}

      <PartnerPaymentModal
        visible={booking?.status === 'COMPLETED'}
        booking={booking}
        onDone={onDone}
      />
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
              {done ? (
                <Ionicons name="checkmark" size={16} color="#ffffff" />
              ) : (
                <Text style={[styles.bubbleText, (done || now) && styles.bubbleTextOn]}>{n}</Text>
              )}
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
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#9ca3af' },
  dotOn: { backgroundColor: '#16a34a' },
  dotOff: { backgroundColor: '#9ca3af' },
  hero: { alignItems: 'center', borderColor: '#000000', borderWidth: 1, gap: 10 },
  timer: { fontSize: 48, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'], color: '#111827' },
  otp: { fontSize: 48, fontWeight: '800', textAlign: 'center', letterSpacing: 10, color: '#111827' },
  steps: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 4 },
  step: { alignItems: 'center', gap: 4 },
  bubble: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  bubbleDone: { backgroundColor: '#16a34a' },
  bubbleNow: { backgroundColor: '#000000' },
  bubbleText: { fontWeight: '800', color: '#6b7280' },
  bubbleTextOn: { color: '#fff' },
  stepLabel: { fontSize: 12, color: '#9ca3af', fontWeight: '600' },
  stepLabelOn: { color: '#111827', fontWeight: '700' },
  error: { color: '#dc2626' },
  mapCard: { padding: 0, overflow: 'hidden', gap: 0, borderRadius: 12 },
  map: { width: '100%', height: 260 },
  mapHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  mapTitleCol: { flex: 1, minWidth: 0, gap: 2, paddingRight: 8 },
  mapTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  livePillOn: { backgroundColor: '#dcfce7' },
  livePillOff: { backgroundColor: '#f1f5f9' },
  livePillText: { fontSize: 12, fontWeight: '700' },
  livePillTextOn: { color: '#15803d' },
  livePillTextOff: { color: '#6b7280' },
  mapFooter: { padding: 12, gap: 8, backgroundColor: '#ffffff' },
  etaRow: { flexDirection: 'row', alignItems: 'center' },
  etaText: { fontSize: 13, fontWeight: '700', color: '#1f2937' },
  btnRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
});
