// Expo dynamic config. GOOGLE_MAPS_API_KEY is read from the environment so
// the key never lands in git (see docs/MAPS_SETUP.md for creating one).
// Without a key, Android renders a black/empty tile grid — markers and UI
// still work, which is exactly the "black screen" symptom.
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
// Public backend URL override (e.g. AWS deployment or cloudflared tunnel).
const API_URL = process.env.EXPO_PUBLIC_API_URL || (process.env.EAS_BUILD ? 'https://98.88.72.217.sslip.io' : '');
const EAS_PROJECT_ID = '9d40680d-fa8b-4d82-b7b2-614b530fc2f4';

module.exports = function () {
  return {
    name: 'ParkPilot Partner',
    slug: 'parkpilot-partner',
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    backgroundColor: '#ffffff',
    primaryColor: '#000000',
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#000000',
    },
    runtimeVersion: {
      policy: 'appVersion',
    },
    updates: {
      url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
      fallbackToCacheTimeout: 0,
      checkAutomatically: 'ON_LOAD',
    },
    extra: {
      apiUrl: API_URL,
      eas: {
        projectId: EAS_PROJECT_ID,
      },
    },
    android: {
      package: 'com.parkpilot.partner',
      userInterfaceStyle: 'light',
      backgroundColor: '#ffffff',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#000000',
      },
      splash: {
        image: './assets/splash.png',
        resizeMode: 'contain',
        backgroundColor: '#000000',
      },
      // Restrict your Maps key to this package name in Google Cloud.
      ...(GOOGLE_MAPS_API_KEY ? { config: { googleMaps: { apiKey: GOOGLE_MAPS_API_KEY } } } : {}),
    },
    ios: {
      bundleIdentifier: 'com.parkpilot.partner',
      userInterfaceStyle: 'light',
      backgroundColor: '#ffffff',
      splash: {
        image: './assets/splash.png',
        resizeMode: 'contain',
        backgroundColor: '#000000',
      },
    },
    plugins: [
      [
        'expo-build-properties',
        {
          android: {
            usesCleartextTraffic: true,
          },
        },
      ],
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission: 'ParkPilot Partner broadcasts your location to customers while you are online.',
        },
      ],
      'expo-secure-store',
      'expo-status-bar',
      'expo-updates',
    ],
  };
};
