# ParkPilot - Architecture & Roadmap

This document outlines the technical architecture, monorepo file structure, and strategic development roadmap for **SmartDrive & Park Network**, a dual-sided urban mobility platform engineered to solve professional driver shortages and peer-to-peer (P2P) parking deficits.

## 1. Architecture & Tech Stack

This architecture leverages a modern full-stack web paradigm mapped to mobile environments, ensuring high velocity for a solo developer by maximizing code reuse across the Customer, Partner, and Admin platforms.

### Backend & Infrastructure (The Engine)

- **Runtime & API:** Node.js and Express.js for scalable REST architecture.
- **Real-Time Data:** Socket.io for low-latency live GPS tracking and bidirectional booking events.
- **Relational Database:** PostgreSQL (managed via Prisma ORM) for highly structured transactional data like user profiles, booking ledgers, and financial records.
- **In-Memory Store:** Redis for ephemeral state management, rate-limiting, and tracking rapidly shifting geocoordinates of available drivers.
- **DevOps:** Docker and Docker Compose for containerized, consistent deployments.

### Mobile Monorepo (The Interfaces)

- **Framework:** React Native with Expo.
- **Language:** TypeScript for end-to-end type safety between the database schema and mobile UI.
- **State Management:** Redux Toolkit or Zustand for handling global session and wallet states.

## 2. Monorepo File Structure

To avoid duplicating code between the Rider app and the Driver app, the project utilizes an Expo Monorepo (powered by Yarn Workspaces).

```plaintext
smartdrive-workspace/
├── apps/
│   ├── customer/            # Expo React Native App: Finds parking, requests drivers
│   ├── partner/             # Expo React Native App: Accepts rides, manages parking spaces
│   └── admin-web/           # Next.js Dashboard: Verifications, commission analytics
├── packages/
│   ├── ui/                  # Shared React Native UI components (Buttons, Map Overlays)
│   ├── api/                 # Shared Axios fetchers, Socket.io client configuration
│   ├── types/               # Shared TypeScript schemas (e.g., BookingStatus interface)
│   └── config/              # Centralized ESLint, Prettier, and tsconfig.json rules
├── backend/                 # Node.js Server Environment
│   ├── prisma/              # PostgreSQL schema & migrations
│   ├── src/
│   │   ├── controllers/     # REST logic (Auth, Payments)
│   │   ├── sockets/         # Real-time tracking and dispatch events
│   │   └── services/        # Third-party integrations (KYC, Maps, Stripe/Razorpay)
│   └── package.json
├── docker-compose.yml       # Spins up Node server, PostgreSQL, and Redis locally
└── package.json             # Root workspace manager
```

## 3. The 20-Day MVP Development Roadmap

This highly condensed schedule focuses strictly on proving the core loop: A customer booking a driver, tracking them via GPS, and executing a mocked payment.

### Days 1-4: Database & Core APIs

- Initialize PostgreSQL and write Prisma schemas for Users, Vehicles, and Bookings.
- Build JWT-based authentication endpoints.
- Implement basic REST endpoints to handle the 20%-25% platform commission and 75%-80% partner split logic.

**Day-by-day:**

- **Day 1 — Repo & Infra ✅ DONE:** Init `backend/`, `docker-compose.yml` (Node, PostgreSQL, Redis), Prisma setup. Done when `docker compose up` runs clean.
- **Day 2 — Auth ✅ DONE:** `Users` schema + JWT register/login/refresh + bcrypt. Done when tested via Postman.
- **Day 3 — Domain Schemas ✅ DONE:** `Vehicles`, `ParkingSpaces`, `Bookings` + commission split (20-25% / 75-80%). Done when migrations pass.
- **Day 4 — REST Core ✅ DONE:** `POST /bookings`, `GET /pricing`, `GET /wallet` (mock). Done when full booking CRUD works without realtime.

### Days 5-8: Real-Time Engine

- Set up the Node.js Socket.io server.
- Create socket events for `DRIVER_LOCATION_UPDATE` and `CUSTOMER_LOCATION_SUBSCRIBE`.
- Implement a mock Node.js script to simulate a moving driver sending lat/lng data.

**Day-by-day:**

- **Day 5 — Sockets Setup:** Socket.io server + auth middleware + rooms (`driver:{id}`, `booking:{id}`). Done when client connects.
- **Day 6 — Location Stream:** `DRIVER_LOCATION_UPDATE` -> Redis + `CUSTOMER_LOCATION_SUBSCRIBE` broadcast. Done when location flows end-to-end.
- **Day 7 — Dispatch:** Nearby driver query + `BOOKING_REQUEST`, `BOOKING_ACCEPT/REJECT`. Done when request reaches driver.
- **Day 8 — Simulator:** Mock driver script sending lat/lng. Done when map shows moving point with <1s latency.

### Days 9-14: Monorepo Setup & Customer App

- Initialize the Expo Workspace and build the `packages/ui` library.
- Integrate `react-native-maps` inside the `apps/customer` directory.
- Build the UI to display vehicle pricing (₹8/KM for drivers, ₹60-₹100/hr for car parking).

**Day-by-day:**

- **Day 9 — Monorepo Init:** Yarn Workspaces `apps/customer`, `packages/ui,api,types,config` + ESLint/Prettier/tsconfig. Done when `yarn customer start` runs.
- **Day 10 — Auth UI:** Navigation + auth screens + `packages/api` Axios integration. Done when login persists session.
- **Day 11 — Maps:** `react-native-maps` + permissions + parking/driver list UI. Done when maps render.
- **Day 12 — Booking Flow:** Request driver UI + pricing display + socket subscribe. Done when customer can request a driver.
- **Day 13 — Tracking & Pay:** Live tracking screen + mock payment. Done when customer loop is closable.
- **Day 14 — SharedPolish:** Harden `packages/ui` + `types/BookingStatus`. Done when no duplicated components.

### Days 15-20: Partner App & End-to-End Testing

- Build the `apps/partner` interface focusing on the active ride dashboard and earnings wallet.
- Connect the Partner app to the device's native geolocation API to broadcast real-world coordinates.
- Execute full physical tests using two separate smartphones to validate live map updates.

**Day-by-day:**

- **Day 15 — Partner Shell:** `apps/partner` + auth reuse + KYC mock screen. Done when partner login works.
- **Day 16 — Requests:** Online/offline toggle + incoming request + accept/reject via socket. Done when it receives Day 12 requests.
- **Day 17 — Active Ride:** Ride dashboard + `expo-location` broadcast + earnings wallet UI. Done when real GPS streams.
- **Day 18 — Host Flow:** List space, availability, bookings management. Done when P2P parking CRUD works.
- **Day 19 — Integration:** Docker full-stack integration, both apps vs backend, fix CORS/socket/auth bugs.
- **Day 20 — Field Test:** 2-phone physical test, bugfix, demo video. Note: `admin-web/` deferred to post-MVP.

## 4. Retrospective: What We Accomplished in 20 Days

At the end of this sprint, the MVP successfully demonstrates the technological viability of the concept to investors:

- **Functional Booking Loop:** Customers can request a driver, and nearby partners receive instant socket-based notifications.
- **Live Tracking:** The map smoothly renders moving driver coordinates with sub-second latency.
- **Modular Foundation:** The monorepo structure guarantees that any UI updates to shared components (like forms or buttons) instantly apply to both mobile apps.
- **Containerized Backend:** The Node.js and Redis logic is fully encapsulated in Docker, ready for basic cloud deployment.

> **Note on Limitations:** This is a prototype. It lacks background battery management for drivers, handles network disconnects poorly, uses unoptimized geographic queries, and relies on mock payment/KYC data.

## 5. Post-20-Day Production Strategy (The Path to Scale)

To transition from a prototype to a consumer-ready enterprise application, development must shift toward system resilience, security, and market-specific operational logistics.

### Phase A: Architecture Hardening & Geospatial Upgrades

- **Migrate to PostGIS:** Standard SQL distance queries will crash the database at scale. Implement PostgreSQL's PostGIS extension to handle heavy geospatial indexing and hyper-fast radius queries for nearby drivers and parking spaces.
- **Implement Distributed Locking:** To prevent two users from booking the same parking space at the exact same millisecond, implement Redis-based distributed locks on checkout operations.
- **Native Background Services:** Replace standard Expo location trackers with robust native background tasks (via `expo-location` background permissions). The Partner App must continue broadcasting GPS data even when the phone screen is locked or the driver switches to another app.

### Phase B: Security, KYC & Financial Ledgers

- **Automated Verification Integrations:** Connect third-party APIs (like Digio or Hyperverge) to handle the mandatory Aadhaar-based KYC checks, driver's license validations, and police verification workflows natively within the Partner App.
- **Double-Entry Financial Ledger:** Transition from simple integer wallet balances to an immutable double-entry ledger. This ensures that the automated partner payout schedule (every 3 to 4 days via UPI/NEFT) is perfectly reconciled with the 20-25% platform take-rate without risk of race conditions.
- **Space Authentication Tools:** Build geo-tagged photo upload and geofencing flows so property owners can cryptographically prove the boundaries of their listed P2P parking spaces.

### Phase C: Strategic Business Rollout

- **High-Density Pilot Launch (Months 1-6):** Limit the live deployment strictly to high-density metro corridors like Delhi NCR, Bengaluru, or Mumbai, ensuring enough liquidity (supply of drivers/spaces) to guarantee fast booking times.
- **B2B and Corporate Integration (Months 6-12):** Expand the Admin console to support corporate bulk-booking features, partnering with tech parks for unutilized commercial parking.
- **Tier 2 Expansion & EV Integration (Months 12-24):** Refactor the database schema to support EV charging attributes (plug types, kilowatt speed) so hosts can monetize charging alongside parking space, rolling this out to Tier-2 cities.
