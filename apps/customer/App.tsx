import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider, useSession } from './src/store/session';
import { LoginScreen } from './src/screens/LoginScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { MapScreen } from './src/screens/MapScreen';
import { BookRideScreen } from './src/screens/BookRideScreen';
import { ParkingScreen } from './src/screens/ParkingScreen';
import { TrackingScreen } from './src/screens/TrackingScreen';
import type { ParkingSpace } from '../../packages/types/src';

// Edit for your environment. LAN IP on a physical phone (Day 20),
// e.g. http://192.168.1.5:4000. Android emulator: http://10.0.2.2:4000.
const API_URL = 'http://localhost:4000';

function Shell(): React.JSX.Element {
  const { user, token, ready, logout } = useSession();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [tab, setTab] = useState<'map' | 'ride'>('map');
  const [space, setSpace] = useState<ParkingSpace | null>(null);
  const [trackingId, setTrackingId] = useState<string | null>(null);

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
  // Day 12: map + ride tabs, marker tap opens parking booking.
  // Day 13: tracking screen closes the loop.
  if (!token) {
    return (
      <View style={styles.center}>
        <Text>Restoring session…</Text>
      </View>
    );
  }
  const reset = (): void => {
    setSpace(null);
    setTrackingId(null);
  };
  return (
    <View style={styles.mapRoot}>
      {trackingId ? (
        <TrackingScreen apiURL={API_URL} token={token} bookingId={trackingId} onDone={() => setTrackingId(null)} />
      ) : space ? (
        <ParkingScreen space={space} onDone={() => setSpace(null)} />
      ) : tab === 'map' ? (
        <MapScreen onBookParking={(s) => setSpace(s)} />
      ) : (
        <BookRideScreen apiURL={API_URL} token={token} onTracking={(id) => setTrackingId(id)} />
      )}
      <View style={styles.tabs}>
        <Text onPress={() => { setTab('map'); reset(); }} style={tab === 'map' ? styles.tabOn : styles.tab}>
          Park
        </Text>
        <Text onPress={() => { setTab('ride'); reset(); }} style={tab === 'ride' ? styles.tabOn : styles.tab}>
          Ride
        </Text>
        <Text onPress={logout} style={styles.tab}>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  mapRoot: { flex: 1 },
  tabs: { flexDirection: 'row', justifyContent: 'space-around', padding: 12, borderTopWidth: 1, borderColor: '#e5e7eb' },
  tab: { color: '#6b7280', fontWeight: '600' },
  tabOn: { color: '#111827', fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '700' },
  link: { color: '#2563eb', textAlign: 'center', padding: 12 },
});
