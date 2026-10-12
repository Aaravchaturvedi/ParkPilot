import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { KycStatus } from '../../packages/types/src';
import { SessionProvider, useSession, LoginScreen, RegisterScreen } from '../../packages/mobile/src';
import { KycScreen } from './src/screens/KycScreen';

const API_URL = 'http://localhost:4000';

function Shell(): React.JSX.Element {
  const { user, ready, logout } = useSession();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [kyc, setKyc] = useState<KycStatus | null>(null);

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
  // Day 16 (requests) + Day 17 (active ride + wallet) plug in here.
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Partner · {user.name}</Text>
      <KycScreen status={kyc ?? user.kycStatus} onChanged={setKyc} />
      <Text onPress={logout} style={styles.link}>
        Sign out
      </Text>
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
  link: { color: '#2563eb', textAlign: 'center', padding: 12 },
});
