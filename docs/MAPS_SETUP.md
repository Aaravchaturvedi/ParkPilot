# Maps — OpenStreetMap, no API key

All maps render **OpenStreetMap tiles via Leaflet inside a WebView**
(`packages/mobile/src/map/SafeMap.tsx`). There is deliberately no Google
Maps dependency for tiles:

- **No API key needed.** Nothing to create, restrict, or bill.
- **Works in Expo Go** (WebView ships with Go; native map modules don't),
  dev builds, and web.
- **Attribution is baked in**: every tile layer carries
  "© OpenStreetMap contributors" per the OSM licence — do not remove it.
- Markers are `<Marker coordinate title pinColor />` elements read as data
  (green = pickup/you, red = drop/space, blue = partner).

## Tile usage policy (read before scaling)

Tiles come from `tile.openstreetmap.org`, which is a donated service with a
[usage policy](https://operations.osmfoundation.org/policies/tiles/): no
heavy/bulk use, desktop-user-agent-style traffic only. A handful of test
phones is fine. For production, point `TILE_URL` in `SafeMap.tsx` at a paid
or free-tier tile provider with the same `{z}/{x}/{y}` format, e.g.:

- Stadia Maps (free tier, needs a key): `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key=KEY`
- MapTiler (free tier, needs a key): `https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=KEY`

and update `TILE_ATTR` to their required attribution.

## If tiles don't load

Leaflet (CDN) + tiles need internet on the phone — the map shows
"Map couldn't load — check data/WiFi" otherwise. No key, no rebuild, no
native config is ever involved.

## Legacy note

`apps/*/app.config.js` still wires an optional `GOOGLE_MAPS_API_KEY` for
Android. It is **unused** while maps render OSM and can be ignored unless
you switch back to Google tiles.
