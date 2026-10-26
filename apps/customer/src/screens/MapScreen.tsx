import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker, SafeMapView } from '../../../../packages/mobile/src/map/SafeMap';
import * as Location from 'expo-location';
import type { ParkingSpace } from '../../../../packages/types/src';
import { nearbySpaces } from '../../../../packages/api/src/index';
import { AppHeader, Button, Card, Divider, EmptyState, FadeIn, ListRow, PriceTag, Screen, SectionLabel, SegmentedControl, SkeletonBlock } from '../../../../packages/ui/src';
import { coordsLabel, usePlaceNames } from '../../../../packages/mobile/src/map/geocode';

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
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const placeNames = usePlaceNames((spaces ?? []).map((s) => ({ id: s.id, lat: s.lat, lng: s.lng })));

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

  const list = spaces ?? [];
  const cheapest = list.length > 0 ? list.reduce((a, b) => (a.pricePerHourPaise <= b.pricePerHourPaise ? a : b)) : null;

  return (
    <Screen refreshing={loading} onRefresh={() => locateAndFetch()}>
      <AppHeader
        title="Find parking"
        subtitle={center ? `Around ${center.latitude.toFixed(3)}, ${center.longitude.toFixed(3)}` : 'Locating you…'}
        right={cheapest ? <PriceTag paise={cheapest.pricePerHourPaise} label="from /hr" /> : undefined}
      />
      <SafeMapView
        initialRegion={region}
        center={{ latitude: region.latitude, longitude: region.longitude }}
        onRegionChangeComplete={(r: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }) => setRegion(r)}
        style={styles.map}
      >
        {list.map((s) => (
          <Marker
            key={s.id}
            coordinate={{ latitude: s.lat, longitude: s.lng }}
            title={`${s.title} — ${s.distanceKm} km`}
            description="Tap to book parking"
            onCalloutPress={() => onBookParking(s)}
          />
        ))}
      </SafeMapView>
      <Card>
        <Text style={styles.cardTitle}>Search area</Text>
        <SegmentedControl
          options={RADII.map((r) => ({ value: r, label: `${r}km` }))}
          value={radius}
          onChange={(r) => {
            setRadius(r);
            const c = center ?? { latitude: region.latitude, longitude: region.longitude };
            void fetchFor(c.latitude, c.longitude, r);
          }}
        />
        <View style={styles.btnRow}>
          <View style={styles.btnFlex}>
            <Button title="This area" variant="secondary" onPress={() => fetchFor(region.latitude, region.longitude, radius)} disabled={loading} />
          </View>
          <View style={styles.btnFlex}>
            <Button title="My location" variant="secondary" onPress={() => locateAndFetch()} disabled={loading} />
          </View>
        </View>
      </Card>
      <SectionLabel>{loading ? 'Searching…' : `${list.length} space${list.length === 1 ? '' : 's'} nearby`}</SectionLabel>
      {spaces === null ? (
        <SkeletonBlock height={180} />
      ) : list.length === 0 && !loading ? (
        <EmptyState
          title="No parking spaces nearby"
          hint="Try increasing search radius or moving the map."
        />
      ) : (
        <Card style={styles.listCard}>
          {list.map((s, i) => (
            <View key={`list-${s.id}`}>
              <FadeIn delay={Math.min(i, 6) * 50}>
                <ListRow
                  title={s.title}
                  sub={`${placeNames[s.id] ?? coordsLabel(s.lat, s.lng)} · ${s.distanceKm} km away`}
                  right={<PriceTag paise={s.pricePerHourPaise} label="/hr" />}
                  onPress={() => onBookParking(s)}
                />
              </FadeIn>
              {i < list.length - 1 ? <Divider /> : null}
            </View>
          ))}
        </Card>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  map: { height: 300, borderRadius: 16 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  btnRow: { flexDirection: 'row', gap: 10 },
  btnFlex: { flex: 1 },
  hint: { color: '#6b7280', fontSize: 12 },
  listCard: { paddingHorizontal: 2, paddingVertical: 2 },
  error: { color: '#dc2626' },
});
