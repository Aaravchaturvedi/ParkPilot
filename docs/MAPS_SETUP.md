# Maps setup — fixing the black map screen

Symptom: the map area is black/empty, but pins, coordinates, lists and all
other UI work. That means the native map view is mounted and your code is
fine — only the **tile layer** is missing. There are exactly two causes:

## Cause 1: no Google Maps API key (Android)

On Android, `react-native-maps` uses the Google Maps SDK, which refuses to
serve tiles without a key. iOS uses Apple Maps and needs no key.

1. Go to Google Cloud Console → create/select a project → enable **Maps SDK
   for Android** (APIs & Services → Library).
2. Credentials → Create Credentials → API key.
3. Restrict the key (recommended): Application restrictions → Android apps →
   add both package names with any SHA-1 while testing:
   - `com.parkpilot.customer`
   - `com.parkpilot.partner`
   (Keys without restrictions also work for local testing; never ship one.)
4. Set it in your shell (both apps read it at **build time**):
   ```bash
   export GOOGLE_MAPS_API_KEY=AIzaSy...
   ```
   or copy `.env.example` → `.env` and set it there. The key is baked into
   `AndroidManifest.xml` as `com.google.android.geo.API_KEY` — it never goes
   through git (`apps/*/app.config.js` reads `process.env` only).
5. **Rebuild** — config changes need a fresh native build:
   ```bash
   cd apps/customer && npx expo run:android
   cd ../partner && npx expo run:android
   ```

## Cause 2: running inside Expo Go

`react-native-maps` is native code and is **not included in Expo Go** — maps
can only render in a development build (`npx expo run:android` /
`npx expo run:ios`) or an EAS build. If you opened the app via Expo Go, that
alone explains the black screen; no key will fix it there.

## How to tell which one it is

- **Expo Go** → Cause 2. Rebuild as a dev client.
- **Dev build + no key set at build time** → Cause 1. Export the key and rebuild.
- **Dev build + key set, still black** → the key is wrong: check Maps SDK for
  Android is enabled, the package name matches (`com.parkpilot.customer` /
  `.partner`), and the restriction allows your debug SHA-1.

The app helps too: every map now shows "Loading map…" and, if tiles still
aren't ready after 8s, a banner naming these two causes
(`packages/mobile/src/map/SafeMap.tsx`).
