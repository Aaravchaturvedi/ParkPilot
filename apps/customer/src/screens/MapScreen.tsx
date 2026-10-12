import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import type { ParkingSpace } from '../../../../packages/types/src';
import { nearbySpaces } from '../../../../packages/api/src/index';
import { PriceTag } from '../../../../packages/ui/src';

type Space = ParkingSpace & { distanceKm: number };

export function MapScreen({ onBookParking }: { onBookParking: (space: Space) => void }): React.JSX.Element {
  const [region, setRegion] = useState({ latitude: 28.6139, longitude: 77.209, latitudeDelta: 0.05, longitudeDelta: 0.05 });
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setError('Location permission denied — showing Connaught Place.');
      } else {
        const pos = await Location.getCurrentPositionAsync();
        setRegion((r) => ({ ...r, latitude: pos.coords.latitude, longitude: pos.coords.longitude }));
      }
      try {
        const { spaces: list } = await nearbySpaces(region.latitude, region.longitude, 5);
        setSpaces(list);
      } catch {
        setError('Could not load parking spaces.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.root}>
      <MapView initialRegion={region} style={styles.map}>
        {spaces.map((s) => (
          <Marker
            key={s.id}
            coordinate={{ latitude: s.lat, longitude: s.lng }}
            title={`${s.title} — ${s.distanceKm} km`}
            onCalloutPress={() => onBookParking(s)}
          />
        ))}
      </MapView>
      <View style={styles.bar}>
        <Text style={styles.count}>{spaces.length} spaces nearby</Text>
        {spaces[0] ? <PriceTag paise={spaces[0].pricePerHourPaise} label="from" /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { flex: 1 },
  bar: { padding: 12, gap: 4 },
  count: { fontSize: 16, fontWeight: '600' },
  error: { color: '#dc2626' },
});
