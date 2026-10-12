# Day 20 Field Test Runbook — two physical phones

Goal: prove the core loop on real hardware: customer books → partner
notified → live GPS on the customer map → mock payment.

## 0. Prep (laptop = backend host)

```bash
# 1. Find your LAN IP (phones must reach the laptop)
hostname -I | awk '{print $1}'   # e.g. 192.168.1.5

# 2. Allow the port through the firewall (UFW example)
sudo ufw allow 4000/tcp

# 3. Start the stack
docker compose up --build -d
curl http://192.168.1.5:4000/health   # replace with YOUR ip
```

## 1. Point both apps at the laptop

In `apps/customer/App.tsx` and `apps/partner/App.tsx`, set:

```ts
const API_URL = 'http://192.168.1.5:4000'; // YOUR lan ip, same WiFi
```

Start each with `npx expo start` (from its app dir) and open via Expo Go,
or `npx expo run:android` / `run:ios` for dev builds (needed for
background location later — Phase A).

## 2. The loop (Phone A = customer, Phone B = partner)

1. **Partner:** sign up (role auto = customer — register a second account
   or ask backend to flip role), submit mock KYC, go **online** (Requests tab).
2. **Partner:** Ride tab → start GPS broadcast. Walk 50m; keep screen on
   (background tracking is Phase A — screen-off stops Expo foreground watch).
3. **Customer:** Ride tab → enter km → Get price → Confirm booking.
4. **Partner:** request banner arrives in Requests → Accept.
5. **Customer:** Track & pay → driver dot moves as partner walks.
6. **Customer:** Pay now (mock). **Partner:** Complete ride → Wallet shows payout.

## 3. Record

- [ ] Request latency (tap Confirm → partner banner): target < 2s on LAN
- [ ] Location updates visible ≤ 2s apart while walking
- [ ] Disconnect test: kill partner app → customer sees frozen dot (reconnect
      handling is Phase A work — note what you observe)
- [ ] Screenshot/video each step for the investor demo

## 4. Known MVP limits (do NOT file as bugs)

- Foreground GPS only; screen-off/lock stops broadcast.
- No reconnect backoff; long disconnects need app restart.
- Haversine radius queries, no PostGIS.
- Mock KYC/payment; balances are aggregates, not a ledger.
- Single backend instance (no Redis socket adapter).
