import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession, LoginScreen, RegisterScreen, resolveApiUrl } from '../../packages/mobile/src';
import { ensureSocket, disconnectSocket } from '../../packages/mobile/src/socket';
import { MapScreen } from './src/screens/MapScreen';
import { BookRideScreen } from './src/screens/BookRideScreen';
import { ParkingScreen } from './src/screens/ParkingScreen';
import { TrackingScreen } from './src/screens/TrackingScreen';
import { TripsScreen } from './src/screens/TripsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { TabBar } from '../../packages/ui/src';
import { Ionicons } from '@expo/vector-icons';
import type { Booking, ParkingSpace } from '../../packages/types/src';

// Backend URL. Resolves to the LAN dev host automatically; set
// EXPO_PUBLIC_API_URL in .env.local when using a cloudflared tunnel (see
// packages/mobile/src/config.ts). Never hardcode an ephemeral tunnel here.
const API_URL = resolveApiUrl();

type Tab = 'map' | 'ride' | 'trips' | 'you';

function Shell(): React.JSX.Element {
  const { user, token, ready, logout } = useSession();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [tab, setTab] = useState<Tab>('map');
  const [space, setSpace] = useState<ParkingSpace | null>(null);
  const [trackingId, setTrackingId] = useState<string | null>(null);
  // Bumped on every global booking:updated so the Trips list + ride card stay
  // fresh even when the update arrives while another tab is visible.
  const [lastUpdate, setLastUpdate] = useState(0);

  // App owns the ONE socket for the whole login session. Screens only add
  // their own listeners via getSocket() — they must never call connectSocket
  // in a way that destroys this connection (see packages/mobile/src/socket).
  useEffect(() => {
    if (!token || !user || (user.role !== 'CUSTOMER' && user.role !== 'ADMIN')) return;
    const s = ensureSocket(API_URL, token);
    const onUpdate = (evt?: { booking?: Booking }): void => {
      setLastUpdate(Date.now());
      const b = evt?.booking;
      if (b?.status === 'ACCEPTED' && b.id) {
        setTrackingId((curr) => curr ?? b.id);
      }
    };
    const onAccepted = (evt?: { booking?: Booking }): void => {
      setLastUpdate(Date.now());
      const b = evt?.booking;
      if (b?.id) {
        setTrackingId(b.id);
      }
    };
    const onRejected = (): void => setLastUpdate(Date.now());
    s.on('booking:updated', onUpdate);
    s.on('booking:accepted', onAccepted);
    s.on('booking:rejected', onRejected);
    return () => {
      s.off('booking:updated', onUpdate);
      s.off('booking:accepted', onAccepted);
      s.off('booking:rejected', onRejected);
    };
  }, [token, user]);

  // Tear down the connection on logout so the next login starts clean.
  const signOut = async (): Promise<void> => {
    disconnectSocket();
    setSpace(null);
    setTrackingId(null);
    setTab('map');
    await logout();
  };

  if (!ready) {
    return <View style={styles.splashHolder} />;
  }
  if (!user) {
    return mode === 'login' ? (
      <LoginScreen onSwitch={() => setMode('register')} />
    ) : (
      <RegisterScreen onSwitch={() => setMode('login')} />
    );
  }
  // One email = one side: PARTNER accounts belong in the partner app.
  if (user.role !== 'CUSTOMER' && user.role !== 'ADMIN') {
    return (
      <View style={styles.center}>
        <Text>This app is for customers. Your account is {user.role}.</Text>
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

  // Overlay stack: parking booking and live tracking sit ABOVE the tabs.
  // Tapping a tab closes any overlay and shows that tab.
  const showingOverlay = trackingId !== null || space !== null;
  const goTab = (t: Tab): void => {
    setSpace(null);
    setTrackingId(null);
    setTab(t);
  };

  return (
    <View style={styles.mapRoot}>
      {trackingId ? (
        <TrackingScreen
          apiURL={API_URL}
          token={token}
          bookingId={trackingId}
          onDone={() => {
            setTrackingId(null);
            setTab('ride');
          }}
        />
      ) : space ? (
        <ParkingScreen space={space} apiURL={API_URL} token={token} onDone={() => setSpace(null)} />
      ) : (
        <View style={styles.tabHost}>
          {/* All tabs stay MOUNTED (display:none when inactive) so tab
              switches never wipe quote drafts, booking cards, or socket
              listeners. This is the core tab-switching fix. */}
          <View style={tab === 'map' ? styles.tabVisible : styles.tabHidden}>
            <MapScreen active={tab === 'map'} apiURL={API_URL} token={token} onBookParking={(s) => setSpace(s)} />
          </View>
          <View style={tab === 'ride' ? styles.tabVisible : styles.tabHidden}>
            <BookRideScreen
              apiURL={API_URL}
              token={token}
              active={tab === 'ride'}
              lastUpdate={lastUpdate}
              onTracking={(id) => setTrackingId(id)}
              onShowTrips={() => goTab('trips')}
            />
          </View>
          <View style={tab === 'trips' ? styles.tabVisible : styles.tabHidden}>
            <TripsScreen active={tab === 'trips'} lastUpdate={lastUpdate} onTrack={(id) => setTrackingId(id)} apiURL={API_URL} token={token} />
          </View>
          <View style={tab === 'you' ? styles.tabVisible : styles.tabHidden}>
            <ProfileScreen onSignOut={signOut} />
          </View>
        </View>
      )}
      <TabBar
        items={[
          {
            key: 'map',
            label: 'Park',
            icon: ({ color, size }) => <Ionicons name="navigate-outline" size={size} color={color} />,
          },
          {
            key: 'ride',
            label: 'Ride',
            icon: ({ color, size }) => <Ionicons name="car-outline" size={size} color={color} />,
          },
          {
            key: 'trips',
            label: 'Trips',
            icon: ({ color, size }) => <Ionicons name="time-outline" size={size} color={color} />,
          },
          {
            key: 'you',
            label: 'You',
            icon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
          },
        ]}
        activeKey={showingOverlay ? '' : tab}
        onPress={(k) => goTab(k as Tab)}
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
  mapRoot: { flex: 1, width: '100%', backgroundColor: '#ffffff' },
  tabHost: { flex: 1, width: '100%' },
  tabVisible: { flex: 1, width: '100%' },
  tabHidden: { flex: 1, display: 'none' },
  title: { fontSize: 22, fontWeight: '700' },
  link: { color: '#09090b', textAlign: 'center', padding: 12, fontWeight: '600' },
});

export type { Booking };
