import { useEffect, useState } from 'react';

// Human-readable place names for raw GPS pins (Nominatim = OSM's free
// reverse-geocoder). Nominatim asks for ≤1 req/s + caching, so this module
// serializes calls through a throttle queue and memoizes by rounded coords.
// Anything unresolvable falls back to the "lat, lng" string the caller gives.
const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();
let queue: Promise<void> = Promise.resolve();
let lastCall = 0;

function roundedKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

async function nominatim(lat: number, lng: number): Promise<string | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
      `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&accept-language=en&addressdetails=1`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const j = (await res.json()) as { display_name?: string };
    return typeof j?.display_name === 'string' ? j.display_name : null;
  } catch {
    return null;
  }
}

async function bigDataCloud(lat: number, lng: number): Promise<string | null> {
  try {
    const url =
      `https://api-bdc.io/data/reverse-geocode-client` +
      `?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&localityLanguage=en`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const j = (await res.json()) as { locality?: string; city?: string; principalSubdivision?: string; countryName?: string };
    const parts = [j.locality, j.city, j.principalSubdivision, j.countryName].filter(
      (p): p is string => typeof p === 'string' && p.trim().length > 0,
    );
    // De-dupe ("Delhi, Delhi") while keeping order.
    const seen = new Set<string>();
    const unique = parts.filter((p) => {
      const k = p.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return unique.length > 0 ? unique.join(', ') : null;
  } catch {
    return null;
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = roundedKey(lat, lng);
  if (cache.has(key)) return cache.get(key) ?? null;
  const running = inflight.get(key);
  if (running) return running;
  const task = queue.then(async (): Promise<string | null> => {
    const wait = 1100 - (Date.now() - lastCall);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    // Primary: OSM Nominatim (street-level detail). Some mobile networks get
    // throttled/blocked here, so a BigDataCloud fallback (city-level, built
    // for client-side use) runs before giving up and showing raw coords.
    return (await nominatim(lat, lng)) ?? (await bigDataCloud(lat, lng));
  });
  inflight.set(key, task);
  queue = task.then(
    () => undefined,
    () => undefined,
  );
  const value = await task;
  inflight.delete(key);
  cache.set(key, value);
  return value;
}

// "Shop 12, Main Bazaar, Connaught Place, New Delhi, Delhi, 110001, India"
// → "Shop 12, Main Bazaar, Connaught Place" (nearest-first, English).
export function shortAddress(displayName: string | null | undefined, fallback: string): string {
  if (!displayName) return fallback;
  const parts = displayName
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return fallback;
  return parts.slice(0, 3).join(', ');
}

export function coordsLabel(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

// Single pin → live address string (starts as coords, upgrades when found).
export function usePlaceName(lat: number | null | undefined, lng: number | null | undefined): string {
  const fallback = lat == null || lng == null ? 'Location not shared' : coordsLabel(lat, lng);
  const [name, setName] = useState(fallback);
  useEffect(() => {
    if (lat == null || lng == null) {
      setName(fallback);
      return;
    }
    let live = true;
    setName(coordsLabel(lat, lng));
    void reverseGeocode(lat, lng).then((full) => {
      if (live && full) setName(shortAddress(full, coordsLabel(lat, lng)));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat == null ? null : lat.toFixed(4), lng == null ? null : lng.toFixed(4)]);
  return name;
}

// Many pins → {id: address} map. One shared cache + throttle across all rows,
// so a 20-space list costs one queued call per unique pin, not a stampede.
export function usePlaceNames(points: Array<{ id: string; lat: number | null | undefined; lng: number | null | undefined }>): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  const key = points.map((p) => `${p.id}@${p.lat ?? ''},${p.lng ?? ''}`).join('|');
  useEffect(() => {
    let live = true;
    const missing = points.filter((p) => p.lat != null && p.lng != null && names[p.id] === undefined);
    if (missing.length === 0) return;
    void (async () => {
      for (const p of missing) {
        if (!live) return;
        const full = await reverseGeocode(p.lat as number, p.lng as number);
        if (!live) return;
        if (full) {
          const label = shortAddress(full, coordsLabel(p.lat as number, p.lng as number));
          setNames((prev) => (prev[p.id] === undefined ? { ...prev, [p.id]: label } : prev));
        }
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return names;
}

// Test seam: clear memoization between unit tests.
export function __resetGeocodeCache(): void {
  cache.clear();
  inflight.clear();
  queue = Promise.resolve();
  lastCall = 0;
}
