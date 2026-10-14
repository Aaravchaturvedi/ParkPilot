import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import type { ParkingSpace } from '../../../../packages/types/src';
import { nearbySpaces } from '../../../../packages/api/src/index';
import { Button, PriceTag, SegmentedControl } from '../../../../packages/ui/src';

// Web fallback (Metro resolves *.web.tsx on web): maps have no web build,
// so web testers pick a space from a list. Native apps use MapScreen.tsx.
type Space = ParkingSpace & { distanceKm: number };

const RADII = [5, 10, 25, 50, 100];

export function MapScreen({ onBookParking, active = true }: { onBookParking: (space: Space) => void; active?: boolean }): React.JSX.Element {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [radius, setRadius] = useState(25);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (r: number, silent = false): Promise<void> => {
    if (!silent) setError(null);
    try {
      const { spaces: list } = await nearbySpaces(28.6139, 77.209, r);
      setSpaces(list);
    } catch {
      if (!silent) setError('Could not load parking spaces.');
    }
  }, []);

  useEffect(() => {
    void load(radius, true);
  }, [load, radius]);

  useEffect(() => {
    if (active) void load(radius, true);
  }, [active, load, radius]);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Nearby spaces (web preview — no map)</Text>
      <SegmentedControl options={RADII.map((r) => ({ value: r, label: `${r}km` }))} value={radius} onChange={setRadius} />
      <Button title="Refresh" onPress={() => load(radius)} />
      {spaces.map((s) => (
        <Pressable key={s.id} style={styles.row} onPress={() => onBookParking(s)}>
          <Text style={styles.name}>{s.title} · {s.distanceKm} km</Text>
          <PriceTag paise={s.pricePerHourPaise} label="per hr" />
        </Pressable>
      ))}
      {spaces.length === 0 && !error ? <Text>Loading… (try a bigger radius — spaces outside it are filtered server-side)</Text> : null}
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
