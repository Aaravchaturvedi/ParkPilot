import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider, useSession, LoginScreen, RegisterScreen } from '../../packages/mobile/src';
import { ensureSocket, disconnectSocket } from '../../packages/mobile/src/socket';
import { MapScreen } from './src/screens/MapScreen';
import { BookRideScreen } from './src/screens/BookRideScreen';
import { ParkingScreen } from './src/screens/ParkingScreen';
import { TrackingScreen } from './src/screens/TrackingScreen';
import { TripsScreen } from './src/screens/TripsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { TabBar } from '../../packages/ui/src';
import type { Booking, ParkingSpace } from '../../packages/types/src';

// Backend URL. Phones off-LAN need the public tunnel URL (changes on reboot);
// on home WiFi use 'http://192.168.1.6:4000'. Do NOT commit a LAN IP.
const API_URL = 'https://raleigh-indiana-grammar-achievement.trycloudflare.com';

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
    const onUpdate = (): void => setLastUpdate(Date.now());
    const onAccepted = (): void => setLastUpdate(Date.now());
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
        <TrackingScreen apiURL={API_URL} token={token} bookingId={trackingId} onDone={() => setTrackingId(null)} />
      ) : space ? (
        <ParkingScreen space={space} apiURL={API_URL} token={token} onDone={() => setSpace(null)} />
      ) : (
        <View style={styles.tabHost}>
          {/* All tabs stay MOUNTED (display:none when inactive) so tab
              switches never wipe quote drafts, booking cards, or socket
              listeners. This is the core tab-switching fix. */}
          <View style={tab === 'map' ? styles.tabVisible : styles.tabHidden}>
            <MapScreen active={tab === 'map'} onBookParking={(s) => setSpace(s)} />
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
          { key: 'map', label: 'Park' },
          { key: 'ride', label: 'Ride' },
          { key: 'trips', label: 'Trips' },
          { key: 'you', label: 'You' },
        ]}
        activeKey={showingOverlay ? '' : tab}
        onPress={(k) => goTab(k as Tab)}
      />
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  mapRoot: { flex: 1 },
  tabHost: { flex: 1 },
  tabVisible: { flex: 1 },
  tabHidden: { flex: 1, display: 'none' },
  title: { fontSize: 22, fontWeight: '700' },
  link: { color: '#2563eb', textAlign: 'center', padding: 12 },
});

export type { Booking };
