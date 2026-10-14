import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider, useSession, LoginScreen, RegisterScreen } from '../../packages/mobile/src';
import { MapScreen } from './src/screens/MapScreen';
import { BookRideScreen } from './src/screens/BookRideScreen';
import { ParkingScreen } from './src/screens/ParkingScreen';
import { TrackingScreen } from './src/screens/TrackingScreen';
import type { ParkingSpace } from '../../packages/types/src';

// Backend URL. Phones off-LAN need the public tunnel URL (changes on reboot);
// on home WiFi use 'http://192.168.1.6:4000'. Do NOT commit a LAN IP.
const API_URL = 'https://markets-fed-connectors-resolve.trycloudflare.com';

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
