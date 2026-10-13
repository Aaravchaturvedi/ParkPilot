import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { KycStatus } from '../../packages/types/src';
import { SessionProvider, useSession, LoginScreen, RegisterScreen } from '../../packages/mobile/src';
import { KycScreen } from './src/screens/KycScreen';
import { RequestsScreen } from './src/screens/RequestsScreen';
import { RideScreen } from './src/screens/RideScreen';
import { WalletScreen } from './src/screens/WalletScreen';
import { HostScreen } from './src/screens/HostScreen';

// Backend URL. Phones off-LAN need the public tunnel URL (changes on reboot);
// on home WiFi use 'http://192.168.1.6:4000'. Do NOT commit a LAN IP.
const API_URL = 'https://miller-permits-dsc-endless.trycloudflare.com';

function Shell(): React.JSX.Element {
  const { user, token, ready, logout } = useSession();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [tab, setTab] = useState<'requests' | 'ride' | 'wallet' | 'host' | 'kyc'>('requests');
  const [rideId, setRideId] = useState<string | null>(null);
  const [kyc, setKyc] = useState<KycStatus | null>(null);

  const goRide = (id: string): void => {
    setRideId(id);
    setTab('ride');
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
        <Text onPress={logout} style={styles.link}>
          Sign out
        </Text>
      </View>
    );
  }
  // Day 17: ride + wallet tabs.
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
      {tab === 'requests' ? (
        <RequestsScreen apiURL={API_URL} token={token} onActive={goRide} />
      ) : tab === 'ride' && rideId ? (
        <RideScreen apiURL={API_URL} token={token} bookingId={rideId} onDone={() => setTab('requests')} />
      ) : tab === 'wallet' ? (
        <WalletScreen />
      ) : tab === 'host' ? (
        <HostScreen />
      ) : (
        <KycScreen status={kyc ?? user.kycStatus} onChanged={setKyc} />
      )}
      <View style={styles.tabs}>
        <Text onPress={() => setTab('requests')} style={tab === 'requests' ? styles.tabOn : styles.tab}>
          Requests
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  root: { flex: 1, paddingTop: 48 },
  title: { fontSize: 20, fontWeight: '700', paddingHorizontal: 16 },
  tabs: { flexDirection: 'row', justifyContent: 'space-around', padding: 12, borderTopWidth: 1, borderColor: '#e5e7eb' },
  tab: { color: '#6b7280', fontWeight: '600' },
  tabOn: { color: '#111827', fontWeight: '700' },
  link: { color: '#2563eb', textAlign: 'center', padding: 12 },
});
