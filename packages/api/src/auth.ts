import type { AuthTokens, Booking, DriverQuote, ParkingQuote, User, Wallet } from '../../types/src';
import { api, setAccessToken } from './client';

export async function register(input: { name: string; email: string; password: string; role?: string }): Promise<{ user: User } & AuthTokens> {
  const { data } = await api().post('/auth/register', input);
  setAccessToken(data.accessToken);
  return data;
}

export async function login(input: { email: string; password: string }): Promise<{ user: User } & AuthTokens> {
  const { data } = await api().post('/auth/login', input);
  setAccessToken(data.accessToken);
  return data;
}

export async function me(): Promise<{ user: User }> {
  const { data } = await api().get('/auth/me');
  return data;
}

export function logout(): void {
  setAccessToken(null);
}
