import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { Marker, SafeMapView } from '../../../../packages/mobile/src/map/SafeMap';
import * as Location from 'expo-location';
import type { ParkingSpace } from '../../../../packages/types/src';
import { nearbySpaces } from '../../../../packages/api/src/index';
import {
  AppHeader,
  Button,
  Card,
  EmptyState,
  FadeIn,
  PriceTag,
  Screen,
  SectionLabel,
  SegmentedControl,
  SkeletonBlock,
} from '../../../../packages/ui/src';
import { coordsLabel, usePlaceNames } from '../../../../packages/mobile/src/map/geocode';
import { Ionicons } from '@expo/vector-icons';
import { getSocket, ensureSocket } from '../../../../packages/mobile/src/socket';

type Space = ParkingSpace & { distanceKm: number };

const FALLBACK = { latitude: 28.6139, longitude: 77.209 };
const RADII = [5, 10, 25, 50, 100];

export function MapScreen({
  onBookParking,
  active = true,
  apiURL,
  token,
}: {
  onBookParking: (space: Space) => void;
  active?: boolean;
  apiURL?: string;
  token?: string;
}): React.JSX.Element {
  const [region, setRegion] = useState({
    latitude: FALLBACK.latitude,
    longitude: FALLBACK.longitude,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });
  const [customerLoc, setCustomerLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  const [radius, setRadius] = useState(5);
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationMin: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const placeNames = usePlaceNames((spaces ?? []).map((s) => ({ id: s.id, lat: s.lat, lng: s.lng })));

  const customerLocRef = useRef(customerLoc);
  customerLocRef.current = customerLoc;
  const radiusRef = useRef(radius);
  radiusRef.current = radius;

  const fetchFor = useCallback(async (lat: number, lng: number, r: number, silent = false): Promise<void> => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { spaces: list } = await nearbySpaces(lat, lng, r);
      setSpaces(list);
      // If currently selected space is no longer in list (paused or deleted), clear selection
      setSelectedSpace((curr) => (curr && !list.some((s) => s.id === curr.id) ? null : curr));
    } catch {
      if (!silent) setError('Could not load parking spaces — pull to retry.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Real-time synchronization: listen for space:changed events from backend
  useEffect(() => {
    const s = getSocket() ?? (apiURL && token ? ensureSocket(apiURL, token) : null);
    if (!s) return;
    const onSpaceChanged = (): void => {
      const c = customerLocRef.current ?? FALLBACK;
      void fetchFor(c.latitude, c.longitude, radiusRef.current, true);
    };
    s.on('space:changed', onSpaceChanged);
    return () => {
      s.off('space:changed', onSpaceChanged);
    };
  }, [apiURL, token, fetchFor]);

  // Periodic poll to ensure spaces are always 100% up-to-date even across network hiccups
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      const c = customerLocRef.current ?? FALLBACK;
      void fetchFor(c.latitude, c.longitude, radiusRef.current, true);
    }, 4000);
    return () => clearInterval(t);
  }, [active, fetchFor]);

  // Locate customer immediately and center map on customer location by default
  const locateAndFetch = useCallback(async (): Promise<void> => {
    setLoading(true);
    let coords = FALLBACK;
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status === 'granted') {
        const last = await Location.getLastKnownPositionAsync().catch(() => null);
        if (last?.coords) {
          coords = { latitude: last.coords.latitude, longitude: last.coords.longitude };
        } else {
          const pos = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise<null>((r) => setTimeout(() => r(null), 3000)),
          ]);
          if (pos?.coords) {
            coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          }
        }
      }
    } catch {
      // fallback to Connaught Place
    }

    setCustomerLoc(coords);
    setRegion({
      latitude: coords.latitude,
      longitude: coords.longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    });
    await fetchFor(coords.latitude, coords.longitude, radius);
  }, [fetchFor, radius]);

  useEffect(() => {
    void locateAndFetch();
  }, [locateAndFetch]);

  // Refetch when returning to tab
  const firstActive = useRef(true);
  useEffect(() => {
    if (!active) return;
    if (firstActive.current) {
      firstActive.current = false;
      return;
    }
    const c = customerLoc ?? FALLBACK;
    void fetchFor(c.latitude, c.longitude, radius, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const list = spaces ?? [];
  const cheapest = list.length > 0 ? list.reduce((a, b) => (a.pricePerHourPaise <= b.pricePerHourPaise ? a : b)) : null;

  const handleOpenGoogleMaps = (space: Space): void => {
    const origin = customerLoc
      ? `${customerLoc.latitude},${customerLoc.longitude}`
      : `${FALLBACK.latitude},${FALLBACK.longitude}`;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${space.lat},${space.lng}`;
    void Linking.openURL(url).catch(() => undefined);
  };

  const handleToggleRoute = (space: Space): void => {
    if (selectedSpace?.id === space.id) {
      setSelectedSpace(null);
      setRouteInfo(null);
    } else {
      setSelectedSpace(space);
      setRouteInfo(null);
    }
  };

  return (
    <Screen refreshing={loading} onRefresh={() => locateAndFetch()}>
      <AppHeader
        title="Find parking"
        subtitle={
          customerLoc
            ? `Your location (${customerLoc.latitude.toFixed(3)}, ${customerLoc.longitude.toFixed(3)})`
            : 'Locating you…'
        }
        right={cheapest ? <PriceTag paise={cheapest.pricePerHourPaise} label="from /hr" /> : undefined}
      />

      {/* Main Top Heading Map: Shows ONLY set location pins (Customer GPS + Parking Spaces), NO route */}
      <SafeMapView
        initialRegion={region}
        center={customerLoc ?? FALLBACK}
        route={null}
        onRegionChangeComplete={(r: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }) =>
          setRegion(r)
        }
        style={styles.map}
      >
        {/* Customer Location Marker (Blue) */}
        {customerLoc ? (
          <Marker
            coordinate={customerLoc}
            title="Your Location"
            pinColor="blue"
          />
        ) : null}

        {/* Parking Space Pins */}
        {list.map((s) => (
          <Marker
            key={s.id}
            coordinate={{ latitude: s.lat, longitude: s.lng }}
            title={`${s.title} — ${s.distanceKm} km`}
            pinColor={selectedSpace?.id === s.id ? 'green' : 'red'}
          />
        ))}
      </SafeMapView>

      {/* Area Search & Re-center Controls */}
      <Card>
        <Text style={styles.cardTitle}>Search area</Text>
        <SegmentedControl
          options={RADII.map((r) => ({ value: r, label: `${r}km` }))}
          value={radius}
          onChange={(r) => {
            setRadius(r);
            const c = customerLoc ?? region;
            void fetchFor(c.latitude, c.longitude, r);
          }}
        />
        <View style={styles.btnRow}>
          <View style={styles.btnFlex}>
            <Button
              title="Search this area"
              variant="secondary"
              block
              onPress={() => fetchFor(region.latitude, region.longitude, radius)}
              disabled={loading}
            />
          </View>
          <View style={styles.btnFlex}>
            <Button
              title="My location"
              variant="secondary"
              block
              icon={<Ionicons name="locate-outline" size={14} color="#111827" />}
              onPress={() => locateAndFetch()}
              disabled={loading}
            />
          </View>
        </View>
      </Card>

      <SectionLabel>
        {loading ? 'Searching…' : `${list.length} parking space${list.length === 1 ? '' : 's'} nearby`}
      </SectionLabel>

      {spaces === null ? (
        <SkeletonBlock height={180} />
      ) : list.length === 0 && !loading ? (
        <EmptyState
          title="No parking spaces nearby"
          hint="Try increasing search radius or moving to Connaught Place."
        />
      ) : (
        <View style={styles.listContainer}>
          {list.map((s, i) => {
            const isSelected = selectedSpace?.id === s.id;
            return (
              <FadeIn key={`space-${s.id}`} delay={Math.min(i, 6) * 50}>
                <Card style={[styles.spaceCard, isSelected && styles.spaceCardSelected]}>
                  {/* Space Header: Title, Address, Price */}
                  <View style={styles.spaceHeader}>
                    <View style={styles.spaceTitleWrap}>
                      <Text style={styles.spaceTitle}>{s.title}</Text>
                      <Text style={styles.spaceAddress}>
                        {placeNames[s.id] ?? coordsLabel(s.lat, s.lng)}
                      </Text>
                    </View>
                    <PriceTag paise={s.pricePerHourPaise} label="/hr" />
                  </View>

                  {/* Distance badge */}
                  <View style={styles.distanceBadgeRow}>
                    <Ionicons name="navigate-circle-outline" size={16} color="#2563eb" />
                    <Text style={styles.distanceText}>
                      {s.distanceKm.toFixed(1)} km away from you
                    </Text>
                  </View>

                  {/* Inline expandable route preview matching Partner RequestsScreen */}
                  {isSelected && customerLoc ? (
                    <View style={styles.inlineRouteWrap}>
                      <SafeMapView
                        initialRegion={{
                          latitude: (customerLoc.latitude + s.lat) / 2,
                          longitude: (customerLoc.longitude + s.lng) / 2,
                          latitudeDelta: Math.max(0.02, Math.abs(customerLoc.latitude - s.lat) * 2.5),
                          longitudeDelta: Math.max(0.02, Math.abs(customerLoc.longitude - s.lng) * 2.5),
                        }}
                        style={styles.inlineMiniMap}
                        route={{
                          from: customerLoc,
                          to: { latitude: s.lat, longitude: s.lng },
                        }}
                        onRouteInfo={setRouteInfo}
                      >
                        <Marker coordinate={customerLoc} title="You" pinColor="blue" />
                        <Marker coordinate={{ latitude: s.lat, longitude: s.lng }} title={s.title} pinColor="red" />
                      </SafeMapView>
                      {routeInfo ? (
                        <Text style={styles.inlineRouteText}>
                          🚗 Drive: {routeInfo.distanceKm.toFixed(1)} km · ~{Math.max(1, Math.round(routeInfo.durationMin))} min to space
                        </Text>
                      ) : (
                        <Text style={styles.inlineRouteDim}>Finding the driving route…</Text>
                      )}
                    </View>
                  ) : null}

                  {/* Responsive Action Buttons: See Route, Google Maps, Book Space */}
                  <View style={styles.btnRow}>
                    <View style={styles.btnFlex}>
                      <Button
                        title={isSelected ? 'Hide route' : 'See route'}
                        variant={isSelected ? 'primary' : 'secondary'}
                        icon={<Ionicons name={isSelected ? 'chevron-up-outline' : 'map-outline'} size={14} color={isSelected ? '#ffffff' : '#111827'} />}
                        block
                        small
                        onPress={() => handleToggleRoute(s)}
                      />
                    </View>
                    <View style={styles.btnFlex}>
                      <Button
                        title="Google Maps"
                        variant="secondary"
                        icon={<Ionicons name="open-outline" size={14} color="#111827" />}
                        iconPosition="right"
                        block
                        small
                        onPress={() => handleOpenGoogleMaps(s)}
                      />
                    </View>
                    <View style={styles.btnFlex}>
                      <Button
                        title="Book Space"
                        variant="primary"
                        block
                        small
                        onPress={() => onBookParking(s)}
                      />
                    </View>
                  </View>
                </Card>
              </FadeIn>
            );
          })}
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  map: { height: 280, borderRadius: 16 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  btnFlex: { flex: 1 },
  listContainer: { gap: 12 },
  spaceCard: {
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  spaceCardSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#f8fafc',
  },
  spaceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  spaceTitleWrap: { flex: 1 },
  spaceTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  spaceAddress: { color: '#6b7280', fontSize: 13, marginTop: 2 },
  distanceBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f3f4f6',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  distanceText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  inlineRouteWrap: {
    gap: 6,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
  },
  inlineMiniMap: {
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
  },
  inlineRouteText: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 13,
  },
  inlineRouteDim: {
    color: '#6b7280',
    fontSize: 12,
  },
  error: { color: '#dc2626' },
});
