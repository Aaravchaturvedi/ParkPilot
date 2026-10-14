import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Booking, KycStatus } from '../../packages/types/src';
import { SessionProvider, useSession, LoginScreen, RegisterScreen } from '../../packages/mobile/src';
import { ensureSocket, disconnectSocket, getSocket } from '../../packages/mobile/src/socket';
import { listBookings } from '../../packages/api/src/index';
import { KycScreen } from './src/screens/KycScreen';
import { RequestsScreen, type Incoming } from './src/screens/RequestsScreen';
import { RideScreen } from './src/screens/RideScreen';
import { WalletScreen } from './src/screens/WalletScreen';
import { HostScreen } from './src/screens/HostScreen';

// Backend URL. Phones off-LAN need the public tunnel URL (changes on reboot);
// on home WiFi use 'http://192.168.1.6:4000'. Do NOT commit a LAN IP.
const API_URL = 'https://valves-facing-log-eternal.trycloudflare.com';

type Tab = 'requests' | 'ride' | 'wallet' | 'host' | 'kyc';

function Shell(): React.JSX.Element {
  const { user, token, ready, logout, refreshUser } = useSession();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [tab, setTab] = useState<Tab>('requests');
  const [online, setOnline] = useState(false); // survives tab switches (lives in App, not the screen)
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [rideId, setRideId] = useState<string | null>(null);
  const [kyc, setKyc] = useState<KycStatus | null>(null);
  const [connected, setConnected] = useState(false);
  const onlineRef = useRef(false);
  onlineRef.current = online;
  const dismissedRef = useRef<Set<string>>(new Set());
  dismissedRef.current = dismissed;

  // Merge helper: socket pushes + REST polls feed the same inbox.
  // - Only DRIVER + REQUESTED belong here (PARKING lives in Spaces tab).
  // - Dismissed (rejected/taken) ids stay hidden until a fresh booking arrives.
  // - booking:updated for a non-REQUESTED id evicts it (taken/cancelled elsewhere).
  const mergeBooking = useCallback((b: Booking) => {
    if (b.type !== 'DRIVER') return;
    if (dismissedRef.current.has(b.id)) return;
    if (b.status !== 'REQUESTED') {
      setIncoming((list) => (list.some((i) => i.booking.id === b.id) ? list.filter((i) => i.booking.id !== b.id) : list));
      return;
    }
    setIncoming((list) =>
      list.some((i) => i.booking.id === b.id)
        ? list.map((i) => (i.booking.id === b.id ? { booking: b, at: i.at } : i))
        : [{ booking: b, at: Date.now() }, ...list].slice(0, 20),
    );
  }, []);

  // REST backstop: socket dispatch is fire-once — a booking created while the
  // app was offline/killed would otherwise be invisible forever. Polling the
  // bookings ledger guarantees the inbox converges even if every push was lost.
  const syncInbox = useCallback(async () => {
    try {
      const { bookings } = await listBookings();
      for (const b of bookings) {
        if (b.type === 'DRIVER' && b.status === 'REQUESTED' && !b.partnerId) mergeBooking(b);
        else if (b.status !== 'REQUESTED') {
          setIncoming((list) => (list.some((i) => i.booking.id === b.id) ? list.filter((i) => i.booking.id !== b.id) : list));
        }
      }
    } catch {
      // silent — socket still delivers live pushes; next poll retries
    }
  }, [mergeBooking]);

  // App owns the ONE socket for the whole login session. It survives tab
  // switches because it lives here, not in any screen. Screens only attach
  // listeners via getSocket().
  useEffect(() => {
    if (!token || !user || (user.role !== 'PARTNER' && user.role !== 'ADMIN')) return;
    const s = ensureSocket(API_URL, token);
    setConnected(s.connected);
    const onConnect = (): void => {
      setConnected(true);
      // Server clears presence on every disconnect, so a reconnect while the
      // toggle is ON must re-register — otherwise dispatch silently skips us.
      if (onlineRef.current) {
        s.emitWithAck('partner:online', {}).catch(() => undefined);
      }
      void syncInbox();
    };
    const onDisconnect = (): void => setConnected(false);
    const onRequest = (evt: { booking: Booking }): void => mergeBooking(evt.booking);
    const onUpdated = (evt: { booking: Booking }): void => {
      const b = evt.booking;
      if (b.type !== 'DRIVER') return;
      if (b.status !== 'REQUESTED') {
        setIncoming((list) => list.filter((i) => i.booking.id !== b.id));
        // If our active ride finished elsewhere, keep rideId (Ride tab shows
        // the terminal state) — don't auto-clear.
      } else {
        mergeBooking(b);
      }
    };
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('booking:request', onRequest);
    s.on('booking:updated', onUpdated);
    // Initial convergence in case requests were created while we were away.
    void syncInbox();
    const poll = setInterval(() => void syncInbox(), 10000);
    return () => {
      clearInterval(poll);
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('booking:request', onRequest);
      s.off('booking:updated', onUpdated);
    };
  }, [token, user, mergeBooking, syncInbox]);

  const markDismissed = useCallback((id: string) => {
    setDismissed((d) => new Set(d).add(id));
    setIncoming((list) => list.filter((i) => i.booking.id !== id));
  }, []);

  const goRide = (id: string): void => {
    setRideId(id);
    setTab('ride');
  };

  const signOut = async (): Promise<void> => {
    try {
      getSocket()?.emit('partner:offline', {});
    } catch {
      // ignore
    }
    disconnectSocket();
    setOnline(false);
    setIncoming([]);
    setDismissed(new Set());
    setRideId(null);
    setTab('requests');
    await logout();
  };

  if (!ready) {
    return (
      <View style={styles.center}>
        <Text>Loading…</Text>
      </View>
    );
  }
  if (!user) {
    return mode === 'login' ? (
      <LoginScreen onSwitch={() => setMode('register')} />
    ) : (
      <RegisterScreen onSwitch={() => setMode('login')} role="PARTNER" />
    );
  }
  if (user.role !== 'PARTNER' && user.role !== 'ADMIN') {
    return (
      <View style={styles.center}>
        <Text>This app is for partners. Your account is {user.role}.</Text>
        <Text onPress={signOut} style={styles.link}>
          Sign out
        </Text>
      </View>
    );
  }
  if (!token) {
    return (
      <View style={styles.center}>
        <Text>Restoring session…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Partner · {user.name}</Text>
      <Text style={styles.presence}>
        {online ? '● Online' : '○ Offline'} · {connected ? 'socket live' : 'socket reconnecting…'} · {incoming.length} request(s)
        {rideId ? ` · ride ${rideId.slice(0, 8)}` : ''}
      </Text>
      <View style={styles.host}>
        {/* All tabs stay MOUNTED (display:none when inactive) so GPS
            broadcast, inbox listeners, and drafts survive tab switches. */}
        <View style={tab === 'requests' ? styles.visible : styles.hidden}>
          <RequestsScreen
            apiURL={API_URL}
            token={token}
            online={online}
            setOnline={setOnline}
            incoming={incoming}
            setIncoming={setIncoming}
            onActive={goRide}
            onDismissed={markDismissed}
            onSync={syncInbox}
            active={tab === 'requests'}
          />
        </View>
        <View style={tab === 'ride' ? styles.visible : styles.hidden}>
          {rideId ? (
            <RideScreen apiURL={API_URL} token={token} bookingId={rideId} active={tab === 'ride'} onDone={() => setTab('requests')} />
          ) : (
            <View style={styles.center}>
              <Text>No active ride.</Text>
              <Text style={styles.dim}>Accept a request first — it opens here automatically.</Text>
            </View>
          )}
        </View>
        <View style={tab === 'host' ? styles.visible : styles.hidden}>
          <HostScreen active={tab === 'host'} apiURL={API_URL} token={token} />
        </View>
        <View style={tab === 'wallet' ? styles.visible : styles.hidden}>
          <WalletScreen active={tab === 'wallet'} />
        </View>
        <View style={tab === 'kyc' ? styles.visible : styles.hidden}>
          <KycScreen
            status={kyc ?? user.kycStatus}
            onChanged={(s) => {
              setKyc(s);
              void refreshUser().catch(() => undefined);
            }}
          />
        </View>
      </View>
      <View style={styles.tabs}>
        <Text onPress={() => setTab('requests')} style={tab === 'requests' ? styles.tabOn : styles.tab}>
          Requests{incoming.length > 0 ? ` (${incoming.length})` : ''}
        </Text>
        <Text onPress={() => setTab('ride')} style={tab === 'ride' ? styles.tabOn : styles.tab}>
          Ride
        </Text>
        <Text onPress={() => setTab('host')} style={tab === 'host' ? styles.tabOn : styles.tab}>
          Spaces
        </Text>
        <Text onPress={() => setTab('wallet')} style={tab === 'wallet' ? styles.tabOn : styles.tab}>
          Wallet
        </Text>
        <Text onPress={() => setTab('kyc')} style={tab === 'kyc' ? styles.tabOn : styles.tab}>
          KYC
        </Text>
        <Text onPress={signOut} style={styles.tab}>
          Out
        </Text>
      </View>
      <StatusBar />
    </View>
  );
}

export default function App(): React.JSX.Element {
  return (
    <SessionProvider baseURL={API_URL}>
      <Shell />
    </SessionProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  root: { flex: 1, paddingTop: 48 },
  title: { fontSize: 20, fontWeight: '700', paddingHorizontal: 16 },
  presence: { fontSize: 12, color: '#6b7280', paddingHorizontal: 16, paddingTop: 4 },
  host: { flex: 1 },
  visible: { flex: 1 },
  hidden: { flex: 1, display: 'none' },
  dim: { color: '#6b7280', textAlign: 'center', paddingHorizontal: 24 },
  tabs: { flexDirection: 'row', justifyContent: 'space-around', padding: 12, borderTopWidth: 1, borderColor: '#e5e7eb' },
  tab: { color: '#6b7280', fontWeight: '600' },
  tabOn: { color: '#111827', fontWeight: '700' },
  link: { color: '#2563eb', textAlign: 'center', padding: 12 },
});
