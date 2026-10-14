# ParkPilot — SmartDrive & Park Network

A dual-sided urban mobility platform: customers hire professional drivers **by time**
(timer model with OTP handshake) and book peer-to-peer **parking spaces**;
partners accept ride requests, run the timer, and host their own spaces.
Real-time dispatch, live GPS tracking, and mock payments — in one TypeScript monorepo.

> **Status:** working MVP. Auth, timer bookings with OTP start/stop, parking bookings,
> live tracking, wallets (mock), and both mobile apps are implemented and verified
> (`tsc` clean, Jest green, backend regression scripts green, live end-to-end runs green).
> Payments, KYC, and the financial ledger are **intentional mocks** — see
> [Production gaps](#9-production-gaps--roadmap).

---

## Table of contents

1. [What it does](#1-what-it-does)
2. [Tech stack & why](#2-tech-stack--why)
3. [Architecture](#3-architecture)
4. [Monorepo file structure](#4-monorepo-file-structure)
5. [Domain model & booking lifecycle](#5-domain-model--booking-lifecycle)
6. [Real-time protocol (Socket.io)](#6-real-time-protocol-socketio)
7. [REST API reference](#7-rest-api-reference)
8. [Getting started](#8-getting-started)
9. [Production gaps & roadmap](#9-production-gaps--roadmap)
10. [Testing & verification](#10-testing--verification)
11. [Configuration reference](#11-configuration-reference)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. What it does

**Customer app** (`apps/customer`) — Park / Ride / Trips / You tabs:

- **Park:** OSM map + radius search (5–100 km) for nearby parking, tappable list fallback,
  space detail with driving route + ETA, hourly quote, booking, live accept status, mock pay.
- **Ride:** 3-page wizard (Duration → Pickup → Review). Books **estimated hours** at the
  fixed platform rate (₹150/hr). Pickup pinned on a real map or via GPS. Live status page
  survives restarts and missed socket pushes (ledger restore + polling).
- **Trip screen:** start-OTP display (read it to the driver), live timer + running bill,
  live driver map with route, end-trip flow (type the driver's stop code), final bill, pay.
- **Trips:** full booking history with cancel / track / pay. **You:** profile + stats + sign out.

**Partner app** (`apps/partner`) — Requests / Ride / Spaces / Wallet / KYC / You tabs:

- **Requests:** online/offline presence toggle, live inbox sorted **nearest-first** with
  distance filter chips, per-request pickup address + drive route map, accept/reject
  (accept auto-opens the Ride tab; races resolve to exactly one winner).
- **Ride:** GPS broadcast toggle, Reached → start-OTP verify → live timer + running payout,
  stop-OTP display, bill, force-close safety net.
- **Spaces:** list spaces (GPS-pinned), pause/activate, repin to GPS, accept parking bookings.
- **Wallet / KYC / You:** mock earnings, mock verification with progress stepper, profile.

---

## 2. Tech stack & why

| Layer | Choice | Why this, not the alternative |
|---|---|---|
| Language (all) | **TypeScript (strict)** | One type system end-to-end: Prisma models → shared `packages/types` → both apps. Catches API drift at compile time instead of on-device. |
| Backend framework | **Express 4** | Solo-dev velocity and a huge middleware ecosystem. Not NestJS (ceremony/DI overhead unjustified at MVP size) or Fastify (smaller plugin surface for auth/sockets). |
| Real-time | **Socket.io 4** (server + client) | Rooms (`user:{id}`, `driver:{id}`, `booking:{id}`, `tracking:{id}`), acks (`emitWithAck`), and auto-reconnect out of the box. Raw WebSockets would mean hand-rolling all three. |
| Database | **PostgreSQL 16 + Prisma 5** | Relational booking ledger needs transactions + migrations; Prisma gives type-safe queries and versioned migrations. Not raw SQL/Knex (no type safety) or Mongo (ledger wants relations/constraints). |
| Ephemeral state | **Redis 7 (ioredis)** | GEO index for nearby-driver dispatch, `partners:online` presence set, last-known driver positions with TTL. Not in-Postgres (write-heavy GPS churn doesn't belong in the ledger). PostGIS is the planned Phase-A upgrade for scale. |
| Auth | **JWT access (15 min) + refresh (7 d), bcryptjs** | Short-lived access limits breach blast radius; refresh keeps sessions alive. Mobile auto-refreshes + retries 401s transparently. Not server sessions (stateless, container-friendly). |
| Money | **Integer paise everywhere** | No float rounding bugs. Commission in basis points (2000 = 20%). |
| Mobile | **Expo SDK 57 + React Native 0.86 + React 19** | Managed workflow, one codebase for two apps, OTA updates later. Not bare RN (native build toil) or Flutter (team is TS/React). |
| Maps | **OpenStreetMap tiles + Leaflet inside WebView** | Zero API keys, zero billing, zero native map modules — renders in **Expo Go**, dev builds, and web alike. `react-native-maps` stays only as a data-type source for `<Marker>` props. Google Maps would need keys, billing, and dev builds for every tester. |
| Geocoding | **Nominatim → BigDataCloud fallback** | Street-level OSM names first; city-level fallback for networks that throttle Nominatim. Throttled to 1 req/s + cached per policy. |
| Routing | **OSRM demo server** | Free driving routes + ETA, dashed straight-line fallback when unreachable. Self-host OSRM for production. |
| HTTP client | **axios + interceptors** | Bearer injection + transparent 401→refresh→retry. `fetch` would need this hand-rolled per call. |
| Monorepo | **npm workspaces** (`apps/*`, `packages/*`, `backend`) | Zero-config sharing for a solo dev. Not Turborepo/Nx (build caching unnecessary at this size). |
| Testing | **Jest + jest-expo + React Native Testing Library** (mobile), **tsx scripts** (backend protocol) | Component behavior + real protocol runs against a live backend. |
| Containers | **Docker + Compose, migrate-on-boot** | Postgres + Redis + backend with `prisma migrate deploy` on boot — fresh clones work with one command. |

---

## 3. Architecture

```
┌──────────────┐   HTTPS/REST + Socket.io   ┌─────────────────────────────┐
│  Customer app │◄─────────────────────────►│                             │
│  (Expo, TS)   │                             │  Backend (Node + Express)   │
└──────────────┘                             │  ├─ REST  (/auth /bookings  │
┌──────────────┐                             │  │   /pricing /spaces …)    │
│  Partner app  │◄─────────────────────────►│  ├─ Socket.io (rooms, acks) │
│  (Expo, TS)   │                             │  └─ Prisma ─► PostgreSQL   │
└──────────────┘                             │  └─ ioredis ─► Redis (GEO,  │
         ▲                                   │      presence, last-known) │
         │ shared packages:                  └─────────────────────────────┘
         │ types (domain + pure math) · api (axios+refresh) ·
         │ ui (design system) · mobile (session/socket/geocode/map)
         ▼
   OSM tiles · Nominatim/BigDataCloud · OSRM (all free, keyless)
```

Key invariants (enforced, tested):

- **One shared socket per app session.** Screens only attach/detach listeners; a singleton
  (`packages/mobile/src/socket.ts`) refuses to destroy a healthy connection. (The old
  reconnect-on-every-screen bug silently killed the partner inbox — regression-tested.)
- **Fire-once dispatch + ledger convergence.** Socket pushes are fast path; every inbox
  also polls the bookings ledger and re-syncs on tab focus, so a missed push can delay
  but never hide a booking.
- **Atomic accept.** `UPDATE … WHERE status='REQUESTED'` — simultaneous accepts serialize
  in the DB: exactly one `200`, the rest `409 booking_not_requested` (proven with a
  same-millisecond live race test).
- **OTP recipient scoping.** Start codes are readable only by the customer, stop codes only
  by the partner — scrubbed from shared socket payloads and per-viewer in REST, delivered
  only to personal rooms (leak-tested live in both directions).
- **Money math parity.** Timer billing (`computeTimerBill` backend ↔ `runningCostPaise`
  client mirror) and haversine distance share one implementation each, unit-tested.

---

## 4. Monorepo file structure

```
ParkPilot/
├── apps/
│   ├── customer/               # Expo app: Park / Ride / Trips / You
│   │   ├── App.tsx             # Shell: session gate, ONE socket, tabs (mounted, display:none),
│   │   │                       # overlays (parking/tracking), API_URL ← edit for your backend
│   │   ├── app.config.js       # Expo config (dynamic: optional GOOGLE_MAPS_API_KEY)
│   │   └── src/screens/        # MapScreen(.web), BookRideScreen, ParkingScreen,
│   │                           # TrackingScreen, TripsScreen, ProfileScreen
│   └── partner/                # Expo app: Requests / Ride / Spaces / Wallet / KYC / You
│       ├── App.tsx             # Shell: inbox merge + presence re-register + polling
│       └── src/screens/        # RequestsScreen, RideScreen, HostScreen,
│                               # WalletScreen, KycScreen, ProfileScreen
├── packages/
│   ├── types/src/index.ts      # Roles, Booking, quotes, haversineKm, timer-bill mirror,
│   │                           # summarizeBookings — the shared source of truth
│   ├── api/src/                # axios client (bearer + 401→refresh→retry), auth, bookings
│   │                           # (incl. OTP handshake), spaces/host, errors
│   ├── ui/src/                 # Design system: theme, Button (press physics, variants,
│   │                           # loading), Card, Field, StatusPill, Avatar/Stat, TabBar,
│   │                           # SegmentedControl, OtpInput (shake), Motion (FadeIn,
│   │                           # EmptyState, Skeleton), Chrome (Screen/AppHeader),
│   │                           # ListRow/SectionLabel/Divider, Wizard (stepped flows)
│   ├── mobile/src/             # SessionProvider (refresh, 401 handler), socket singleton,
│   │                           # storage, Login/Register screens,
│   │                           # map/: SafeMap (OSM WebView), osmTemplate, geocode
│   └── config/                 # Shared base tsconfig
├── backend/
│   ├── prisma/schema.prisma    # User, Vehicle, ParkingSpace, Booking (+timer/OTP fields)
│   ├── prisma/migrations/      # Versioned migrations (incl. driver_timer_otp)
│   ├── src/
│   │   ├── routes/             # auth, bookings, pricing, spaces, vehicles, wallet
│   │   ├── controllers/        # REST handlers + per-viewer OTP scrubbing + OTP fan-out
│   │   ├── services/           # bookings (accept race guard, OTP handshake, timer bill),
│   │   │                       # pricing (quotes, splits), spaces (haversine nearby)
│   │   ├── sockets/            # index (auth, rooms, auto-join, presence reset),
│   │   │                       # dispatch (geo/presence fan-out, accept/reject),
│   │   │                       # location (GPS ingest, tracking rooms, online toggle)
│   │   ├── lib/                # prisma, redis, tokens (JWT)
│   │   └── middleware/         # requireAuth, async handler
│   └── scripts/                # socket-test, location-test, dispatch-test,
│                               # presence-test, simulate-driver (tsx, live-backend)
├── __tests__/                  # Jest suite (9 files: auth, screens, inbox, restore,
│                               # distance, timer bill, geocode, OSM template, summary)
├── docs/                       # FIELD_TEST.md (2-phone runbook), MAPS_SETUP.md (OSM)
├── docker-compose.yml          # postgres + redis + backend (migrate-on-boot)
└── jest.config.js              # jest-expo preset
```

Generated/secret paths (gitignored, never commit): `apps/*/android|ios`, `apps/*/.expo`,
`dist/`, `node_modules/`, any `.env`, keystores, `google-services.json`.

---

## 5. Domain model & booking lifecycle

### Timer model (DRIVER) — the core loop

Fixed platform rate **₹150/hr**. Customer books **estimated hours**; the final bill uses
**actual elapsed time**: `billed = max(60min, ceil(seconds/60))`, split by the booking's
`commissionBps` (20–25%).

```
REQUESTED ──accept──▶ ACCEPTED ──start OTP verify──▶ ONGOING ──stop OTP verify──▶ COMPLETED ──pay──▶ paid
   │                    │                                │
   └──── customer ──────┴──── cancel ───────────────────┘
        (REQUESTED or ACCEPTED only; terminal states immutable)
```

**OTP handshake** (in-app display, 4-digit, 10-min TTL, single-use, regenerable):

1. Partner at the customer taps *Reached — send code* → server mints **start OTP** →
   emitted **only** to the customer's personal room + readable only in the customer's
   booking payloads.
2. Customer reads it aloud → partner types it → `start-verify` → `ONGOING`, `startedAt` set.
3. Customer taps *End trip* → server mints **stop OTP** → emitted **only** to the
   partner's personal room + readable only in the partner's payloads.
4. Partner reads it aloud → customer types it → `stop-verify` → server computes
   `billedMinutes`/`amountPaise`/splits from `startedAt→endedAt` → `COMPLETED` → pay.

### Parking model (PARKING)

Quote (`price/hr × hours`) → `REQUESTED` → **space owner only** may accept
(`403 only_space_owner_accepts` otherwise; hosts read their bookings via space ownership)
→ pay. Paused/unavailable spaces reject with `space_not_available`.

### Dispatch (how a request finds partners)

1. DRIVER with pickup coords → fresh-GPS partners within 5 km (Redis GEO + 90 s freshness
   sweep), falling back to `partners:online` presence set; without coords → presence set → live drivers.
2. Going online **redelivers** missed open DRIVER + own PARKING requests (dispatch is
   fire-once; this + client polling closes the gap).
3. Presence is per-connection (toggle-gated, cleared on disconnect, **reset on server boot**
   so restarts can't leave ghost-online drivers), and re-registers automatically on socket reconnect.

---

## 6. Real-time protocol (Socket.io)

Rooms: `user:{id}` (always), `driver:{id}` (partners), `booking:{id}` (explicit join +
server auto-join of live bookings), `tracking:{driverId}` (customer subscribes).

| Direction | Event | Payload / meaning |
|---|---|---|
| C→S | `booking:join` / `booking:leave` | `{ bookingId }` — join a booking room (party-checked) |
| P→S | `partner:online` / `partner:offline` | presence toggle (acked; online triggers redelivery) |
| P→S | `driver:location` | `{ lat, lng }` (~0.5 Hz throttled) → Redis GEO + `driver:moved` fan-out |
| C→S | `tracking:subscribe` | `{ driverId }` → joins tracking room, returns last-known fix |
| P→S | `booking:accept` / `booking:reject` | accept is atomic (409 on race); reject = per-partner dismissal, status untouched |
| S→C | `booking:updated`, `booking:accepted`, `booking:rejected` | status fan-out (OTP fields scrubbed) |
| S→C | `booking:start-otp` | `{ bookingId, otp, expiresAt }` — **customer room only** |
| S→P | `booking:stop-otp` | `{ bookingId, otp, expiresAt }` — **partner room only** |
| S→C | `driver:moved` | `{ driverId, lat, lng, at }` live dots |

---

## 7. REST API reference

Base URL = `API_URL` in `apps/*/App.tsx`. Auth: `Authorization: Bearer <accessToken>`
(15 min TTL; clients auto-refresh via `/auth/refresh` and retry once on 401).

| Method & path | Who | Body / query → result |
|---|---|---|
| `POST /auth/register` | public | `{ name, email, password, role? }` → user + tokens |
| `POST /auth/login` | public | `{ email, password }` → user + tokens |
| `POST /auth/refresh` | public | `{ refreshToken }` → fresh tokens |
| `GET /auth/me` | any | → current user |
| `PATCH /auth/kyc` | any | mock submit → `kycStatus: SUBMITTED` |
| `GET /pricing/quote?type=driver_hours&hours=` | public | estimate at fixed ₹150/hr + splits |
| `GET /pricing/quote?type=parking…` | public | `{ pricePerHourPaise, hours }` → quote |
| `POST /bookings` | customer | DRIVER `{ hours, pickupLat?, pickupLng? }` · PARKING `{ spaceId, hours }` → `{ booking, notified[] }` |
| `GET /bookings` · `GET /bookings/:id` | party | own ledger (customer ∪ partner ∪ space-owner) |
| `PATCH /bookings/:id/accept` | partner | atomic first-wins; parking restricted to owner |
| `POST /bookings/:id/start-otp` | assigned partner | mints start code (customer-visible only) |
| `POST /bookings/:id/start-verify` | assigned partner | `{ otp }` → `ONGOING` + `startedAt` |
| `POST /bookings/:id/stop-otp` | customer | mints stop code (partner-visible only) |
| `POST /bookings/:id/stop-verify` | customer | `{ otp }` → `COMPLETED` + final timer bill |
| `PATCH /bookings/:id/cancel` | customer | REQUESTED/ACCEPTED → CANCELLED |
| `PATCH /bookings/:id/complete` | partner | stuck-trip safety net (no timer bill) |
| `PATCH /bookings/:id/pay` | customer | mock payment → `COMPLETED` (payable once ACCEPTED+) |
| `GET /spaces/nearby?lat&lng&radiusKm` | public | active spaces sorted nearest-first (+`distanceKm`) |
| `POST /spaces` · `GET /spaces/mine` · `PATCH /spaces/:id` | partner | CRUD incl. GPS pin + repin (`lat/lng`) + pause |
| `GET /wallet` | any | mock `{ earned, pending }` (+ spent for customers) |

---

## 8. Getting started

### Prereqs

- Node ≥ 20, Docker + Compose, Expo Go app on test phones (dev builds only for native maps).
- Clone, then copy env: `cp .env.example .env` and set `POSTGRES_PASSWORD`,
  `JWT_SECRET` (≥32 random chars). Never commit `.env`.

### Backend (one command)

```bash
docker compose up --build        # postgres + redis + backend (migrates on boot)
curl http://localhost:4000/health
```

Local dev instead: `npm run dev:backend -w backend` (needs local Postgres/Redis via `DATABASE_URL`/`REDIS_URL`).
Useful: `npm run typecheck -w backend`, `npm run build -w backend`,
`npm run prisma:migrate -w backend`.

### Mobile apps (two terminals)

```bash
cd apps/customer && npx expo start            # phone 1 (customer)
cd apps/partner  && npx expo start --port 8082 # phone 2 (partner)
```

- Same WiFi for laptop + phones, or `npx expo start --tunnel`.
- **Backend reachability:** set `API_URL` in both `apps/*/App.tsx` — your LAN
  (`http://<lan-ip>:4000`) or a tunnel (`cloudflared tunnel --url http://localhost:4000`).
  Tunnel hosts are ephemeral: if login suddenly says *cannot reach the server*, re-check
  `<API_URL>/health` in the phone browser first. Do not commit LAN IPs/keys.
- Maps need **no key** (OSM). Expo Go shows everything except native map tiles are
  replaced by the OSM WebView (works in Go). For native tiles use a dev build:
  `npx expo run:android` (see `docs/MAPS_SETUP.md`).

### Two-phone smoke test (happy path)

Partner: register (PARTNER) → Spaces → list a GPS-pinned space → Requests → Go online.
Customer: register → Park → open the space → hours → Review → Confirm → host Accepts → Pay.
Ride: hours → GPS pickup → Review → Confirm → partner Accepts → broadcast → start code →
verify → timer → End → stop code → confirm → bill → pay. Full script: `docs/FIELD_TEST.md`.

---

## 9. Production gaps & roadmap

Deliberate MVP simplifications (all labeled `mock`/Phase in code):

- **Payments/KYC** are state flips, not providers (Stripe/Razorpay, Digio/Hyperverge).
- **Ledger** is mutable booking rows, not an immutable double-entry ledger.
- **Push notifications** don't exist — convergence relies on sockets + polling while open.
- **PostGIS + distributed locks** replace Haversine/Redis-GEO + `updateMany` guards at scale.
- Free-tier map services (OSM tiles, Nominatim, OSRM demo) need provider SLAs in prod.
- Background GPS, battery management, and reconnect hardening are minimal.

---

## 10. Testing & verification

```bash
npx jest __tests__                 # 9 suites: auth errors, login/register screens,
                                   # requests inbox, ride restore, distance, timer bill,
                                   # geocode+fallback, OSM template, trip summary
BASE=http://localhost:4000 npx tsx backend/scripts/socket-test.ts
BASE=http://localhost:4000 npx tsx backend/scripts/presence-test.ts
BASE=http://localhost:4000 npx tsx backend/scripts/dispatch-test.ts
BASE=http://localhost:4000 npx tsx backend/scripts/location-test.ts
```

Also verified live (not just in CI): same-millisecond double-accept → exactly one winner;
OTP leak test in both directions (socket + REST); full timer loop incl. first-hour minimum;
repin → 5 km visibility; tunnel login path; rendered Leaflet JS syntax-checked.

Typecheck everything: `npm run typecheck -w backend` plus
`npx tsc --noEmit -p {apps/customer,apps/partner,packages/{ui,mobile,api,types}}/tsconfig.json`.

---

## 11. Configuration reference

| Key / place | Purpose | Notes |
|---|---|---|
| `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (`.env`) | backend wiring | required; see `.env.example` |
| `API_URL` (`apps/*/App.tsx`) | backend base for both apps | tunnel host or LAN IP; ephemeral — never commit secrets here |
| `GOOGLE_MAPS_API_KEY` (env, build-time) | optional legacy Google tiles | unused while maps render OSM; read by `app.config.js` only if set |
| `packages` (`com.parkpilot.customer/.partner`) | Android identity | needed for key restriction + builds |

---

## 12. Troubleshooting

| Symptom | Most likely cause → fix |
|---|---|
| *Cannot reach the server* at login | Dead tunnel host → open `<API_URL>/health` in the phone browser; restart tunnel, paste new host into both `App.tsx`, reload Expo |
| Booking/actions 401 after ~15 min | Old bundle without auto-refresh → reload the app (current code refreshes + retries) |
| Request accepted but customer still REQUESTED | Stale card → it self-heals: restore-on-open + 8 s poll + tab-focus sync (pre-refresh bundles lack this — reload) |
| Space invisible nearby | Pinned far away / paused / radius too small → Spaces → *Repin to GPS*, widen radius, *Search this area* |
| Map blank/black | Needs internet (tiles+CDN live); in dev builds without OSM fallback check `docs/MAPS_SETUP.md` |
| Only coords, no addresses | Offline geocoder or no OSM data → add internet; names upgrade in place ~1–2 s after coords appear |
| Two partners accept | By design exactly one wins (`409`); loser sees *"already taken"* and the card dismisses |
