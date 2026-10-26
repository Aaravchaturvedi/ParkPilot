import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import {
  PIN_COLORS,
  pageHtml,
  type MarkerSpec,
  type RouteSpec,
  type SafeMapRegion,
} from './osmTemplate';

export type { MarkerSpec, RouteSpec, SafeMapRegion };

export interface MarkerProps {
  coordinate?: { latitude: number; longitude: number };
  title?: string;
  pinColor?: string;
}

export function Marker(_props: MarkerProps): React.JSX.Element | null {
  return null;
}

interface Props {
  initialRegion: SafeMapRegion;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  onRegionChangeComplete?: (r: SafeMapRegion) => void;
  onPress?: (coord: { latitude: number; longitude: number }) => void;
  route?: RouteSpec | null;
  onRouteInfo?: (info: { distanceKm: number; durationMin: number } | null) => void;
  center?: { latitude: number; longitude: number } | null;
}

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

export function SafeMapView({
  initialRegion,
  style,
  children,
  onRegionChangeComplete,
  onPress,
  route,
  onRouteInfo,
  center,
}: Props): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const cbRef = useRef(onRegionChangeComplete);
  cbRef.current = onRegionChangeComplete;
  const pressCbRef = useRef(onPress);
  pressCbRef.current = onPress;
  const routeCbRef = useRef(onRouteInfo);
  routeCbRef.current = onRouteInfo;

  const markers = useMemo(() => readMarkers(children), [children]);
  const html = useMemo(() => pageHtml(initialRegion, markers, route ?? null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const liveKey = JSON.stringify({ markers, route: route ?? null, center: center ?? null });
  useEffect(() => {
    try {
      const payload = JSON.parse(liveKey) as { markers: MarkerSpec[]; route: RouteSpec | null; center: { latitude: number; longitude: number } | null };
      const win = iframeRef.current?.contentWindow as (Window & { __updateMap?: (data: string) => void }) | null;
      if (win && typeof win.__updateMap === 'function') {
        win.__updateMap(JSON.stringify(payload));
      }
    } catch {
      // ignore
    }
  }, [liveKey]);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      try {
        const msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (!msg || typeof msg !== 'object') return;
        if (msg.kind === 'route') {
          if (Number.isFinite(msg.distanceKm) && Number.isFinite(msg.durationMin)) {
            routeCbRef.current?.({ distanceKm: msg.distanceKm, durationMin: msg.durationMin });
          }
          return;
        }
        if (msg.kind === 'click') {
          if (Number.isFinite(msg.latitude) && Number.isFinite(msg.longitude)) {
            pressCbRef.current?.({ latitude: msg.latitude, longitude: msg.longitude });
          }
          return;
        }
        if (Number.isFinite(msg.latitude) && Number.isFinite(msg.longitude)) {
          cbRef.current?.(msg as SafeMapRegion);
        }
      } catch {
        // ignore malformed posts
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }
  }, []);

  if (failed) {
    return (
      <View style={[styles.wrap, style, styles.failed]}>
        <Text style={styles.failedTitle}>Map couldn't load</Text>
        <Text style={styles.failedHint}>Map tiles need an internet connection (OpenStreetMap + Leaflet CDN).</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <iframe
        ref={iframeRef}
        srcDoc={html}
        title="Map"
        style={{ width: '100%', height: '100%', border: 'none' }}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#e5e7eb', flex: 1 },
  failed: { alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16 },
  failedTitle: { fontWeight: '800', color: '#111827' },
  failedHint: { color: '#6b7280', fontSize: 12, textAlign: 'center' },
});
