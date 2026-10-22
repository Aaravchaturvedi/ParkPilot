import { Platform } from 'react-native';
import { resolveApiUrl } from '../packages/mobile/src/config';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { hostUri: undefined, extra: {} } },
}));

const Constants = require('expo-constants').default as {
  expoConfig: { hostUri?: string; extra: { apiUrl?: string } };
};

afterEach(() => {
  Constants.expoConfig = { hostUri: undefined, extra: {} };
  delete process.env.EXPO_PUBLIC_API_URL;
});

describe('resolveApiUrl', () => {
  it('uses an explicit EXPO_PUBLIC_API_URL override and strips trailing slashes', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://fresh-tunnel.trycloudflare.com/';
    expect(resolveApiUrl()).toBe('https://fresh-tunnel.trycloudflare.com');
  });

  it('uses the app config extra.apiUrl when the env var is absent', () => {
    Constants.expoConfig.extra.apiUrl = 'https://from-config.trycloudflare.com';
    expect(resolveApiUrl()).toBe('https://from-config.trycloudflare.com');
  });

  it('derives the LAN backend from the Metro dev-server host', () => {
    Constants.expoConfig.hostUri = '192.168.1.6:8081';
    expect(resolveApiUrl()).toBe('http://192.168.1.6:4000');
  });

  it('never reuses an Expo tunnel host for the backend (it only proxies Metro)', () => {
    Constants.expoConfig.hostUri = 'abc-anonymous-8081.exp.direct';
    expect(resolveApiUrl()).toBe(
      Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000',
    );
  });

  it('falls back to the emulator loopback without any dev host in dev mode', () => {
    expect(resolveApiUrl()).toBe(
      Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000',
    );
  });

  it('falls back to the production API URL in standalone release builds', () => {
    const prevDev = (global as any).__DEV__;
    try {
      (global as any).__DEV__ = false;
      expect(resolveApiUrl()).toBe('https://98.88.72.217.sslip.io');
    } finally {
      (global as any).__DEV__ = prevDev;
    }
  });
});
