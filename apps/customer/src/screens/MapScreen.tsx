import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { Marker } from 'react-native-maps';
import { SafeMapView } from '../../../../packages/mobile/src/map/SafeMap';
import * as Location from 'expo-location';
import type { ParkingSpace } from '../../../../packages/types/src';
import { nearbySpaces } from '../../../../packages/api/src/index';
import { Button, PriceTag } from '../../../../packages/ui/src';

type Space = ParkingSpace & { distanceKm: number };

const FALLBACK = { latitude: 28.6139, longitude: 77.209 };
const RADII = [5, 10, 25, 50, 100];

// Park tab: nearby P2P spaces on a map + a tappable list fallback.
// Why a space can be invisible: the server filters to isActive spaces within
// `radius` km of the SEARCH CENTER (your GPS on load, or the map center when
// you press "Search this area"). A space pinned far away, a paused space, or
// a too-small radius all yield an empty list — the empty state now tells you
// which one it is and the radius buttons fix it in one tap.
export function MapScreen({ onBookParking, active = true }: { onBookParking: (space: Space) => void; active?: boolean }): React.JSX.Element {
  const [region, setRegion] = useState({ latitude: FALLBACK.latitude, longitude: FALLBACK.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 });
  const [center, setCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [radius, setRadius] = useState(5);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);

  const fetchFor = useCallback(async (lat: number, lng: number, r: number): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const { spaces: list } = await nearbySpaces(lat, lng, r);
      setSpaces(list);
      setCenter({ latitude: lat, longitude: lng });
    } catch {
      setError('Could not load parking spaces — pull to retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  const locateAndFetch = useCallback(async (): Promise<void> => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setError('Location permission denied — showing Connaught Place.');
        setRegion((prev) => ({ ...prev, latitude: FALLBACK.latitude, longitude: FALLBACK.longitude }));
        await fetchFor(FALLBACK.latitude, FALLBACK.longitude, radius);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = pos.coords;
      setRegion((prev) => ({ ...prev, latitude, longitude }));
      await fetchFor(latitude, longitude, radius);
    } catch {
      setError('GPS failed — showing Connaught Place.');
      await fetchFor(FALLBACK.latitude, FALLBACK.longitude, radius);
    }
  }, [fetchFor, radius]);

  useEffect(() => {
    mounted.current = true;
    void locateAndFetch();
  }, [locateAndFetch]);

  // Refetch when the user RETURNS to this tab (spaces may have changed while
  // away). Skipped on first mount — locateAndFetch already covered it — so we
  // never overwrite fresh GPS results with the stale default region.
  const firstActive = useRef(true);
  useEffect(() => {
    if (!active) return;
    if (firstActive.current) {
      firstActive.current = false;
      return;
    }
    const c = center ?? { latitude: region.latitude, longitude: region.longitude };
    void fetchFor(c.latitude, c.longitude, radius);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => locateAndFetch()} />}
    >
      <SafeMapView
        initialRegion={region}
        onRegionChangeComplete={(r: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }) => setRegion(r)}
        style={styles.map}
      >
        {spaces.map((s) => (
          <Marker
            key={s.id}
            coordinate={{ latitude: s.lat, longitude: s.lng }}
            title={`${s.title} — ${s.distanceKm} km`}
            description="Tap to book parking"
            onCalloutPress={() => onBookParking(s)}
          />
        ))}
      </SafeMapView>
      <View style={styles.bar}>
        <Text style={styles.count}>
          {loading ? 'Searching…' : `${spaces.length} space(s) within ${radius} km`}
        </Text>
        {center ? <Text style={styles.hint}>Search center {center.latitude.toFixed(3)}, {center.longitude.toFixed(3)} · drag the map, then Search this area.</Text> : null}
        {spaces[0] ? <PriceTag paise={spaces[0].pricePerHourPaise} label="from /hr" /> : null}
        <View style={styles.radiusRow}>
          {RADII.map((r) => (
            <Pressable key={r} onPress={() => { setRadius(r); const c = center ?? { latitude: region.latitude, longitude: region.longitude }; void fetchFor(c.latitude, c.longitude, r); }} style={r === radius ? styles.radiusOn : styles.radiusOff}>
              <Text style={r === radius ? styles.radiusTextOn : styles.radiusText}>{r}km</Text>
            </Pressable>
          ))}
        </View>
        <Button title="Search this area (map center)" onPress={() => fetchFor(region.latitude, region.longitude, radius)} disabled={loading} />
        <Button title="Use my location" onPress={() => locateAndFetch()} disabled={loading} />
        {spaces.length === 0 && !loading ? (
          <Text style={styles.hint}>Nothing here — the space may be paused, pinned outside this radius, or listed on another server. Try a bigger radius or Search this area.</Text>
        ) : null}
        {spaces.map((s) => (
          <Pressable key={`list-${s.id}`} style={styles.row} onPress={() => onBookParking(s)}>
            <Text style={styles.name}>{s.title} · {s.distanceKm} km</Text>
            <PriceTag paise={s.pricePerHourPaise} label="per hr" />
          </Pressable>
        ))}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1 },
  map: { height: 320 },
  bar: { padding: 12, gap: 8 },
  count: { fontSize: 16, fontWeight: '600' },
  hint: { color: '#6b7280', fontSize: 12 },
  radiusRow: { flexDirection: 'row', gap: 8 },
  radiusOff: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  radiusOn: { borderWidth: 1, borderColor: '#111827', backgroundColor: '#111827', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  radiusText: { color: '#6b7280', fontWeight: '600' },
  radiusTextOn: { color: '#fff', fontWeight: '700' },
  row: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, gap: 4 },
  name: { fontSize: 16, fontWeight: '600' },
  error: { color: '#dc2626' },
});
