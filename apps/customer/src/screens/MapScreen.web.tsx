import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import type { ParkingSpace } from '../../../../packages/types/src';
import { nearbySpaces } from '../../../../packages/api/src/index';
import { PriceTag } from '../../../../packages/ui/src';

// Web fallback (Metro resolves *.web.tsx on web): maps have no web build,
// so web testers pick a space from a list. Native apps use MapScreen.tsx.
type Space = ParkingSpace & { distanceKm: number };

export function MapScreen({ onBookParking }: { onBookParking: (space: Space) => void }): React.JSX.Element {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    nearbySpaces(28.6139, 77.209, 5)
      .then(({ spaces: list }) => setSpaces(list))
      .catch(() => setError('Could not load parking spaces.'));
  }, []);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Nearby spaces (web preview — no map)</Text>
      {spaces.map((s) => (
        <Pressable key={s.id} style={styles.row} onPress={() => onBookParking(s)}>
          <Text style={styles.name}>{s.title} · {s.distanceKm} km</Text>
          <PriceTag paise={s.pricePerHourPaise} label="per hr" />
        </Pressable>
      ))}
      {spaces.length === 0 && !error ? <Text>Loading…</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 8 },
  title: { fontSize: 18, fontWeight: '700' },
  row: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, gap: 4 },
  name: { fontSize: 16, fontWeight: '600' },
  error: { color: '#dc2626' },
});
