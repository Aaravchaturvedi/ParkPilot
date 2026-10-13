// Token persistence. Uses expo-secure-store at runtime; falls back to
// memory when native/web storage is unavailable or throws (e.g. web stub
// mismatch) so a storage fault can never wedge the app on Loading.
import * as SecureStore from 'expo-secure-store';

export interface SavedSession {
  accessToken: string;
  refreshToken: string;
}

const A_KEY = 'pp.access';
const R_KEY = 'pp.refresh';
let mem: SavedSession | null = null;

function storeAvailable(): boolean {
  try {
    return typeof SecureStore.getItemAsync === 'function';
  } catch {
    return false;
  }
}

export async function saveSession(s: SavedSession): Promise<void> {
  mem = s;
  if (!storeAvailable()) return;
  try {
    await SecureStore.setItemAsync(A_KEY, s.accessToken);
    await SecureStore.setItemAsync(R_KEY, s.refreshToken);
  } catch {
    // memory copy above keeps the session alive for this launch
  }
}

export async function loadSession(): Promise<SavedSession | null> {
  if (storeAvailable()) {
    try {
      const a = await SecureStore.getItemAsync(A_KEY);
      const r = await SecureStore.getItemAsync(R_KEY);
      if (a && r) return { accessToken: a, refreshToken: r };
    } catch {
      // fall through to memory
    }
  }
  return mem;
}

export async function clearSession(): Promise<void> {
  mem = null;
  if (!storeAvailable()) return;
  try {
    await SecureStore.deleteItemAsync(A_KEY);
    await SecureStore.deleteItemAsync(R_KEY);
  } catch {
    // already cleared in memory
  }
}
