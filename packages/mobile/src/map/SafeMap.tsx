import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import {
  PIN_COLORS,
  pageHtml,
  type MarkerSpec,
  type RouteSpec,
  type SafeMapRegion,
} from './osmTemplate';

export type { MarkerSpec, RouteSpec, SafeMapRegion };

interface Props {
  initialRegion: SafeMapRegion;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  onRegionChangeComplete?: (r: SafeMapRegion) => void;
  // Driving route overlay (OSRM, free): {from: you, to: destination}.
  route?: RouteSpec | null;
  onRouteInfo?: (info: { distanceKm: number; durationMin: number } | null) => void;
  // Controlled re-center: when the screen moves this (GPS fix, "use my
  // location"), the map glides there. Map drags flow back out through
  // onRegionChangeComplete; identical values bail out in React, so no
  // ping-pong loop is possible.
  center?: { latitude: number; longitude: number } | null;
}

// Marker children (<Marker coordinate title pinColor />) are read as data —
// never rendered natively — so this works in Expo Go, dev builds, and web.
function readMarkers(children: React.ReactNode): MarkerSpec[] {
  const out: MarkerSpec[] = [];
  React.Children.forEach(children, (c) => {
    if (!React.isValidElement(c)) return;
    const p = c.props as { coordinate?: { latitude: number; longitude: number }; title?: string; pinColor?: string };
    if (p.coordinate && Number.isFinite(p.coordinate.latitude) && Number.isFinite(p.coordinate.longitude)) {
      out.push({
        latitude: p.coordinate.latitude,
        longitude: p.coordinate.longitude,
        title: p.title,
        color: PIN_COLORS[p.pinColor ?? ''] ?? '#ef4444',
      });
    }
  });
  return out;
}

export function SafeMapView({ initialRegion, style, children, onRegionChangeComplete, route, onRouteInfo, center }: Props): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  const webRef = useRef<WebView>(null);
  const cbRef = useRef(onRegionChangeComplete);
  cbRef.current = onRegionChangeComplete;
  const routeCbRef = useRef(onRouteInfo);
  routeCbRef.current = onRouteInfo;

  const markers = useMemo(() => readMarkers(children), [children]);
  const html = useMemo(() => pageHtml(initialRegion, markers, route ?? null), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Push marker/route/center updates into the live page without reloads.
  // Center glides the map on GPS fixes; user drags echo back identical
  // values and React bails out, so this cannot loop.
  const liveKey = JSON.stringify({ markers, route: route ?? null, center: center ?? null });
  useEffect(() => {
    const payload = JSON.parse(liveKey) as { markers: MarkerSpec[]; route: RouteSpec | null; center: { latitude: number; longitude: number } | null };
    webRef.current?.injectJavaScript(`window.__updateMap(${JSON.stringify(JSON.stringify(payload))});true;`);
  }, [liveKey]);

  const onMessage = (e: WebViewMessageEvent): void => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as
        | ({ kind: 'region' } & SafeMapRegion)
        | { kind: 'route'; distanceKm: number; durationMin: number };
      if (msg.kind === 'route') {
        if (Number.isFinite(msg.distanceKm) && Number.isFinite(msg.durationMin)) {
          routeCbRef.current?.({ distanceKm: msg.distanceKm, durationMin: msg.durationMin });
        }
        return;
      }
      if (Number.isFinite(msg.latitude) && Number.isFinite(msg.longitude)) cbRef.current?.(msg);
    } catch {
      // ignore malformed posts
    }
  };

  if (failed) {
    return (
      <View style={[styles.wrap, style, styles.failed]}>
        <Text style={styles.failedTitle}>Map couldn't load</Text>
        <Text style={styles.failedHint}>Map tiles need an internet connection (OpenStreetMap + Leaflet CDN). Check data/WiFi and reopen this tab.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <WebView
        ref={webRef}
        source={{ html }}
        style={styles.web}
        originWhitelist={['*']}
        onMessage={onMessage}
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#e5e7eb' },
  web: { flex: 1, backgroundColor: 'transparent' },
  failed: { alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16 },
  failedTitle: { fontWeight: '800', color: '#111827' },
  failedHint: { color: '#6b7280', fontSize: 12, textAlign: 'center' },
});
