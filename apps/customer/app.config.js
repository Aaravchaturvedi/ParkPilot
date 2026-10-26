// Expo dynamic config. GOOGLE_MAPS_API_KEY is read from the environment so
// the key never lands in git (see docs/MAPS_SETUP.md for creating one).
// Without a key, Android renders a black/empty tile grid — markers and UI
// still work, which is exactly the "black screen" symptom.
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
// Backend URL override (e.g. cloudflared tunnel or custom LAN IP).
const API_URL = process.env.EXPO_PUBLIC_API_URL || '';
const EAS_PROJECT_ID = 'dac2cdb5-c96b-4ce7-9c78-6d65f647b307';

module.exports = function () {
  return {
    name: 'ParkPilot Customer',
    slug: 'parkpilot-customer',
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
      package: 'com.parkpilot.customer',
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
      bundleIdentifier: 'com.parkpilot.customer',
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
          locationAlwaysAndWhenInUsePermission: 'ParkPilot needs your location to find drivers and parking.',
        },
      ],
      'expo-secure-store',
      'expo-status-bar',
      'expo-updates',
    ],
  };
};
