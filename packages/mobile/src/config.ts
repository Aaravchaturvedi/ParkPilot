import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

const BACKEND_PORT = 4000;

// Expo tunnel/ngrok hosts only forward Metro (port 8081); they do NOT proxy
// the backend, so they must never be reused as the API host.
const TUNNEL_HOST = /\.(exp\.direct|ngrok\.io|ngrok-free\.app)$/i;

function expoDevHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return null;
  const host = hostUri
    .replace(/^\w+:\/\//, '') // strip a scheme if present
    .split('/')[0] // drop any path
    .replace(/:\d+$/, ''); // drop the Metro port
  if (!host || TUNNEL_HOST.test(host)) return null;
  return host;
}

// Dev builds (expo run:android/ios) may not expose expoConfig.hostUri; the
// bundle URL still reveals the machine serving Metro.
function bundleHost(): string | null {
  const scriptURL = (NativeModules as { SourceCode?: { scriptURL?: string } }).SourceCode?.scriptURL;
  if (!scriptURL) return null;
  const match = /^https?:\/\/([^/:]+)/i.exec(scriptURL);
  const host = match?.[1];
  if (!host || TUNNEL_HOST.test(host)) return null;
  // adb-reversed bundle URLs say localhost; only the Android emulator's
  // 10.0.2.2 fallback (or an explicit override) can reach the host machine.
  if (Platform.OS === 'android' && (host === 'localhost' || host === '127.0.0.1')) return null;
  return host;
}

/**
 * Backend base URL, resolved in priority order:
 *
 * 1. `EXPO_PUBLIC_API_URL` (or `expo.extra.apiUrl`) — set this when using a tunnel,
 *    e.g. `cloudflared tunnel --url http://localhost:4000` or custom override.
 * 2. The Expo dev-server host — works out of the box when phone and laptop are
 *    on the same WiFi (Metro already knows the laptop's LAN IP).
 * 3. Android emulator loopback (10.0.2.2:4000) or localhost:4000.
 */
export function resolveApiUrl(): string {
  const fromExtra = Constants.expoConfig?.extra?.apiUrl as string | undefined;
  const fromEnv = typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_API_URL : undefined;
  const override = (fromEnv || fromExtra || '').trim();
  if (override) return override.replace(/\/+$/, '');

  const host = expoDevHost() || bundleHost();
  if (host) return `http://${host}:${BACKEND_PORT}`;

  // Android emulators reach the host machine through 10.0.2.2, not localhost.
  if (Platform.OS === 'android') return `http://10.0.2.2:${BACKEND_PORT}`;
  return `http://localhost:${BACKEND_PORT}`;
}
