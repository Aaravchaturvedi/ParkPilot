import axios, { AxiosInstance } from 'axios';

let client: AxiosInstance | null = null;
let accessToken: string | null = null;

export function initApi(baseURL: string): AxiosInstance {
  client = axios.create({ baseURL, timeout: 10000 });
  client.interceptors.request.use((config) => {
    if (accessToken) {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>).Authorization = `Bearer ${accessToken}`;
    }
    return config;
  });
  return client;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function api(): AxiosInstance {
  if (!client) throw new Error('api_not_initialized_call_initApi_first');
  return client;
}
