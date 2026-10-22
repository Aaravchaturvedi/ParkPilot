import axios from 'axios';
import { getApiBaseURL } from './client';

// One honest message per failure class, so a dead server never
// masquerades as "wrong password".
export function friendlyAuthError(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e)) {
    if (!e.response) {
      // Naming the URL makes a stale tunnel/env entry obvious at a glance.
      const base = getApiBaseURL();
      return base
        ? `Cannot reach the server at ${base} — check your connection, then reload the app.`
        : 'Cannot reach the server — check your connection, then reload the app.';
    }
    if (e.response.status === 401) return 'Login failed — check email/password.';
    if (e.response.status === 409) return 'Email already registered — sign in instead.';
    const serverMsg = (e.response.data as { error?: string } | undefined)?.error;
    if (serverMsg) return `Request failed (${serverMsg}).`;
  }
  return fallback;
}
