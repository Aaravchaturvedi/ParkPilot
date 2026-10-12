import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// Day 9 shell. Screens land Days 10-13 (auth, map, booking, tracking).
export default function App(): React.JSX.Element {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>ParkPilot Customer</Text>
      <Text>Day 9 shell — screens wire up Days 10-13.</Text>
      <StatusBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
});
