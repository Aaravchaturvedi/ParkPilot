// Shared map with built-in failure visibility. A missing Google Maps key or
// running inside Expo Go both produce a black/empty tile grid with zero
// console signal to the user — so this wrapper shows a loading veil and, if
// tiles still aren't ready after 8s, the exact two things to check.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import MapView from 'react-native-maps';

export interface SafeMapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

interface Props {
  initialRegion: SafeMapRegion;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  onRegionChangeComplete?: (r: SafeMapRegion) => void;
}

export function SafeMapView({ initialRegion, style, children, onRegionChangeComplete }: Props): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  const readyRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!readyRef.current) setSlow(true);
    }, 8000);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={[styles.wrap, style]}>
      <MapView
        initialRegion={initialRegion}
        style={styles.map}
        onRegionChangeComplete={onRegionChangeComplete}
        onMapReady={() => {
          readyRef.current = true;
          setReady(true);
        }}
      >
        {children}
      </MapView>
      {!ready ? (
        <View pointerEvents="none" style={styles.veil}>
          <Text style={styles.veilText}>Loading map…</Text>
        </View>
      ) : null}
      {slow && !ready ? (
        <View style={styles.hint}>
          <Text style={styles.hintText}>Map tiles aren't loading. Two usual causes: (1) no Google Maps API key in the build — see docs/MAPS_SETUP.md; (2) running in Expo Go, which can't render maps — use a dev build (`npx expo run:android`).</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  map: { flex: 1 },
  veil: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6' },
  veilText: { color: '#6b7280' },
  hint: { padding: 8, backgroundColor: '#fef3c7' },
  hintText: { color: '#92400e', fontSize: 12 },
});
