// Token persistence. Uses expo-secure-store at runtime; falls back to
// memory in environments without native modules (e.g. web preview).
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
  await SecureStore.setItemAsync(A_KEY, s.accessToken);
  await SecureStore.setItemAsync(R_KEY, s.refreshToken);
}

export async function loadSession(): Promise<SavedSession | null> {
  if (storeAvailable()) {
    const a = await SecureStore.getItemAsync(A_KEY);
    const r = await SecureStore.getItemAsync(R_KEY);
    if (a && r) return { accessToken: a, refreshToken: r };
  }
  return mem;
}

export async function clearSession(): Promise<void> {
  mem = null;
  if (!storeAvailable()) return;
  await SecureStore.deleteItemAsync(A_KEY);
  await SecureStore.deleteItemAsync(R_KEY);
}
