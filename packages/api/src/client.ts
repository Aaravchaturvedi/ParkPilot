import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

let client: AxiosInstance | null = null;
let accessToken: string | null = null;

// Set by SessionProvider: exchanges the saved refresh token for a fresh
// access token, returning it (or null when refresh is impossible).
// Without this, every API call starts 401ing 15 minutes after login and the
// user sees "Booking failed" on a perfectly healthy server.
let refreshHandler: (() => Promise<string | null>) | null = null;

export function setRefreshHandler(fn: (() => Promise<string | null>) | null): void {
  refreshHandler = fn;
}

interface RetriedConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

export function initApi(baseURL: string): AxiosInstance {
  client = axios.create({ baseURL, timeout: 10000 });
  client.interceptors.request.use((config) => {
    if (accessToken) {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>).Authorization = `Bearer ${accessToken}`;
    }
    return config;
  });
  client.interceptors.response.use(
    (res) => res,
    async (error: AxiosError) => {
      const config = error.config as RetriedConfig | undefined;
      if (
        error.response?.status === 401 &&
        config &&
        !config._retried &&
        refreshHandler &&
        !config.url?.includes('/auth/refresh') &&
        !config.url?.includes('/auth/login') &&
        !config.url?.includes('/auth/register')
      ) {
        config._retried = true;
        try {
          const fresh = await refreshHandler();
          if (fresh) {
            config.headers = config.headers ?? {};
            (config.headers as Record<string, string>).Authorization = `Bearer ${fresh}`;
            return client?.(config);
          }
        } catch {
          // refresh failed — fall through to the original 401
        }
      }
      throw error;
    },
  );
  return client;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function api(): AxiosInstance {
  if (!client) throw new Error('api_not_initialized_call_initApi_first');
  return client;
}
