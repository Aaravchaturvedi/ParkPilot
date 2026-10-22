import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import type { Booking, KycStatus } from '../../packages/types/src';
import { SessionProvider, useSession, LoginScreen, RegisterScreen, resolveApiUrl } from '../../packages/mobile/src';
import { ensureSocket, disconnectSocket, getSocket } from '../../packages/mobile/src/socket';
import { listBookings, checkOpenRequests } from '../../packages/api/src/index';
import { RequestsScreen, type Incoming } from './src/screens/RequestsScreen';
import { RideScreen } from './src/screens/RideScreen';
import { WalletScreen } from './src/screens/WalletScreen';
import { HostScreen } from './src/screens/HostScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { TabBar, ScreenInsetsContext } from '../../packages/ui/src';
import { Ionicons } from '@expo/vector-icons';

// Backend URL. Resolves to the LAN dev host automatically; set
// EXPO_PUBLIC_API_URL in .env.local when using a cloudflared tunnel (see
// packages/mobile/src/config.ts). Never hardcode an ephemeral tunnel here.
const API_URL = resolveApiUrl();

type Tab = 'requests' | 'ride' | 'wallet' | 'host' | 'you';

function Shell(): React.JSX.Element {
  const { user, token, ready, logout, refreshUser } = useSession();
  const safeInsets = React.useContext(SafeAreaInsetsContext);
  const insets = safeInsets ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [tab, setTab] = useState<Tab>('requests');
  const [online, setOnline] = useState(false); // survives tab switches (lives in App, not the screen)
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [rideId, setRideId] = useState<string | null>(null);
  const [hasActiveRide, setHasActiveRide] = useState(false);
  const [kyc, setKyc] = useState<KycStatus | null>(null);
  const [connected, setConnected] = useState(false);
  const onlineRef = useRef(false);
  onlineRef.current = online;
  const hasActiveRideRef = useRef(false);
  hasActiveRideRef.current = hasActiveRide;
  const rideIdRef = useRef<string | null>(null);
  rideIdRef.current = rideId;
  const dismissedRef = useRef<Set<string>>(new Set());
  dismissedRef.current = dismissed;
  const incomingRef = useRef<Incoming[]>([]);
  incomingRef.current = incoming;

  // Merge helper: socket pushes + REST polls feed the same inbox.
  // - Only DRIVER + REQUESTED belong here (PARKING lives in Spaces tab).
  // - When offline or when a ride is in progress, incoming requests are ignored.
  // - Dismissed (rejected/taken) ids stay hidden until a fresh booking arrives.
  // - booking:updated for a non-REQUESTED id evicts it (taken/cancelled elsewhere).
  const mergeBooking = useCallback((b: Booking) => {
    if (!onlineRef.current || hasActiveRideRef.current) return;
    if (b.type !== 'DRIVER') return;
    if (dismissedRef.current.has(b.id)) return;
    if (b.status !== 'REQUESTED' || b.partnerId) {
      setIncoming((list) => (list.some((i) => i.booking.id === b.id) ? list.filter((i) => i.booking.id !== b.id) : list));
      return;
    }
    setIncoming((list) =>
      list.some((i) => i.booking.id === b.id)
        ? list.map((i) => (i.booking.id === b.id ? { booking: b, at: i.at } : i))
        : [{ booking: b, at: Date.now() }, ...list].slice(0, 20),
    );
  }, []);

  // REST backstop: dynamic DB query guarantees that if a ride was accepted,
  // cancelled, or deleted in the DB, it auto-deletes from this partner's inbox
  // immediately, even if a socket packet was missed.
  const syncInbox = useCallback(async () => {
    if (!onlineRef.current || hasActiveRideRef.current) {
      setIncoming([]);
      return;
    }
    try {
      const currentIds = incomingRef.current.map((i) => i.booking.id);
      const { openBookings, statusMap } = await checkOpenRequests(currentIds);

      // 1. Evict any ride that has been accepted by another partner or is no longer REQUESTED in DB
      setIncoming((list) =>
        list.filter((i) => {
          const id = i.booking.id;
          const status = statusMap[id];
          if (status && status !== 'REQUESTED') {
            return false;
          }
          return true;
        }),
      );

      // 2. Merge newly found open unassigned requests from the DB
      for (const b of openBookings) {
        if (b.type === 'DRIVER' && b.status === 'REQUESTED' && !b.partnerId) {
          mergeBooking(b);
        }
      }
    } catch {
      // silent — socket still delivers live pushes; next poll retries
    }
  }, [mergeBooking]);

  const checkActiveRide = useCallback(async () => {
    try {
      const { bookings } = await listBookings();
      const active = bookings.find(
        (b) => b.type === 'DRIVER' && (b.status === 'ACCEPTED' || b.status === 'ONGOING')
      );
      if (active) {
        setRideId(active.id);
        setHasActiveRide(true);
      } else if (!rideIdRef.current) {
        setHasActiveRide(false);
      }
    } catch {
      // non-fatal
    }
  }, []);

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
      void checkActiveRide();
      void syncInbox();
    };
    const onDisconnect = (): void => setConnected(false);
    const onRequest = (evt: { booking: Booking }): void => mergeBooking(evt.booking);
    const onUpdated = (evt: { booking: Booking }): void => {
      const b = evt.booking;
      if (b.type !== 'DRIVER') return;
      if (b.id === rideIdRef.current || (b.partnerId && b.partnerId === user?.id)) {
        if (b.status === 'ACCEPTED' || b.status === 'ONGOING') {
          setHasActiveRide(true);
          setRideId(b.id);
        } else if (b.status === 'COMPLETED' || b.status === 'CANCELLED') {
          setHasActiveRide(false);
        }
      }
      if (b.status !== 'REQUESTED') {
        setIncoming((list) => list.filter((i) => i.booking.id !== b.id));
        // If our active ride finished elsewhere, keep rideId (Ride tab shows
        // the terminal state) — don't auto-clear.
      } else if (!hasActiveRideRef.current) {
        mergeBooking(b);
      }
    };
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('booking:request', onRequest);
    s.on('booking:updated', onUpdated);
    // Initial convergence in case requests were created while we were away.
    void checkActiveRide();
    void syncInbox();
    const poll = setInterval(() => {
      if ((onlineRef.current && !hasActiveRideRef.current) || incomingRef.current.length > 0) {
        void syncInbox();
      }
    }, 3000);
    return () => {
      clearInterval(poll);
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('booking:request', onRequest);
      s.off('booking:updated', onUpdated);
    };
  }, [token, user, mergeBooking, syncInbox, checkActiveRide]);

  const markDismissed = useCallback((id: string) => {
    setDismissed((d) => new Set(d).add(id));
    setIncoming((list) => list.filter((i) => i.booking.id !== id));
  }, []);

  const goRide = (id: string): void => {
    setRideId(id);
    setHasActiveRide(true);
    setIncoming([]);
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
    setHasActiveRide(false);
    setIncoming([]);
    setDismissed(new Set());
    setRideId(null);
    setTab('requests');
    await logout();
  };

  if (!ready) {
    return <View style={styles.splashHolder} />;
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
      <View
        style={[
          styles.topHeader,
          {
            paddingTop: insets.top > 0 ? insets.top + 4 : 12,
            paddingLeft: Math.max(insets.left, 16),
            paddingRight: Math.max(insets.right, 16),
          },
        ]}
      >
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>Partner · {user.name}</Text>
          <View style={[styles.statusDot, online ? styles.statusDotOn : styles.statusDotOff]} />
        </View>
        <Text style={styles.presence} numberOfLines={1}>
          {online ? '● Online' : '○ Offline'} · {connected ? 'socket live' : 'socket reconnecting…'}
          {online && !hasActiveRide ? ` · ${incoming.length} request(s)` : ''}
          {hasActiveRide ? ' · ride in progress' : rideId ? ` · ride ${rideId.slice(0, 8)}` : ''}
        </Text>
      </View>
      <ScreenInsetsContext.Provider value={{ noTopInset: true }}>
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
              hasActiveRide={hasActiveRide}
              onGoRide={() => setTab('ride')}
            />
          </View>
          <View style={tab === 'ride' ? styles.visible : styles.hidden}>
            {rideId ? (
              <RideScreen
                apiURL={API_URL}
                token={token}
                bookingId={rideId}
                active={tab === 'ride'}
                onDone={() => {
                  setRideId(null);
                  setHasActiveRide(false);
                  setTab('requests');
                  void syncInbox();
                }}
              />
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
          <View style={tab === 'you' ? styles.visible : styles.hidden}>
            <ProfileScreen
              online={online}
              onSignOut={signOut}
              kycStatus={kyc ?? user.kycStatus}
              onKycChanged={(s) => {
                setKyc(s);
                void refreshUser().catch(() => undefined);
              }}
            />
          </View>
        </View>
      </ScreenInsetsContext.Provider>
      <TabBar
        items={[
          {
            key: 'requests',
            label: 'Requests',
            badge: online && !hasActiveRide ? incoming.length : 0,
            icon: ({ color, size }) => <Ionicons name="flash-outline" size={size} color={color} />,
          },
          {
            key: 'ride',
            label: 'Ride',
            icon: ({ color, size }) => <Ionicons name="car-sport-outline" size={size} color={color} />,
          },
          {
            key: 'host',
            label: 'Spaces',
            icon: ({ color, size }) => <Ionicons name="business-outline" size={size} color={color} />,
          },
          {
            key: 'wallet',
            label: 'Wallet',
            icon: ({ color, size }) => <Ionicons name="wallet-outline" size={size} color={color} />,
          },
          {
            key: 'you',
            label: 'You',
            icon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
          },
        ]}
        activeKey={tab}
        onPress={(k) => setTab(k as Tab)}
      />
    </View>
  );
}

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      <SessionProvider baseURL={API_URL}>
        <Shell />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splashHolder: { flex: 1, backgroundColor: '#ffffff', width: '100%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24, backgroundColor: '#ffffff' },
  root: { flex: 1, backgroundColor: '#ffffff', width: '100%' },
  topHeader: {
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e4e4e7',
    backgroundColor: '#ffffff',
    width: '100%',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#9ca3af' },
  statusDotOn: { backgroundColor: '#10b981' },
  statusDotOff: { backgroundColor: '#ef4444' },
  presence: { fontSize: 12, color: '#6b7280', paddingTop: 2 },
  host: { flex: 1, width: '100%' },
  visible: { flex: 1, width: '100%' },
  hidden: { flex: 1, display: 'none' },
  dim: { color: '#6b7280', textAlign: 'center', paddingHorizontal: 24 },
  link: { color: '#09090b', textAlign: 'center', padding: 12, fontWeight: '600' },
});
