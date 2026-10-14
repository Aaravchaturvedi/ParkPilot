// Expo dynamic config. GOOGLE_MAPS_API_KEY is read from the environment so
// the key never lands in git (see docs/MAPS_SETUP.md for creating one).
// Without a key, Android renders a black/empty tile grid — markers and UI
// still work, which is exactly the "black screen" symptom.
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

module.exports = function () {
  return {
    name: 'ParkPilot Customer',
    slug: 'parkpilot-customer',
    version: '0.1.0',
    orientation: 'portrait',
    android: {
      package: 'com.parkpilot.customer',
      // Restrict your Maps key to this package name in Google Cloud.
      ...(GOOGLE_MAPS_API_KEY ? { config: { googleMaps: { apiKey: GOOGLE_MAPS_API_KEY } } } : {}),
    },
    ios: {
      bundleIdentifier: 'com.parkpilot.customer',
    },
    plugins: [
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission: 'ParkPilot needs your location to find drivers and parking.',
        },
      ],
      'expo-secure-store',
      'expo-status-bar',
    ],
  };
};
