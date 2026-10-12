import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider, useSession } from './src/store/session';
import { LoginScreen } from './src/screens/LoginScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';

// Edit for your environment. LAN IP on a physical phone (Day 20),
// e.g. http://192.168.1.5:4000. Android emulator: http://10.0.2.2:4000.
const API_URL = 'http://localhost:4000';

function Shell(): React.JSX.Element {
  const { user, ready, logout } = useSession();
  const [mode, setMode] = useState<'login' | 'register'>('login');

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
  // Day 11+ replaces this with the map/booking navigator.
  return (
    <View style={styles.center}>
      <Text style={styles.title}>Hi, {user.name}</Text>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  link: { color: '#2563eb' },
});
