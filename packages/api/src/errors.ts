import axios from 'axios';

// One honest message per failure class, so a dead server never
// masquerades as "wrong password".
export function friendlyAuthError(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e)) {
    if (!e.response) return 'Cannot reach the server — check your connection, then reload the app.';
    if (e.response.status === 401) return 'Login failed — check email/password.';
    if (e.response.status === 409) return 'Email already registered — sign in instead.';
    const serverMsg = (e.response.data as { error?: string } | undefined)?.error;
    if (serverMsg) return `Request failed (${serverMsg}).`;
  }
  return fallback;
}
