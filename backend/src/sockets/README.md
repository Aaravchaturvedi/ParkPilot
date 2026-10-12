# Socket protocol (MVP)

Auth: every connection must send the access JWT in handshake auth:
`io(URL, { auth: { token: accessToken } })`. No token / bad token →
`connect_error` (`missing_token` / `invalid_token`).

Rooms (server-managed):
- `user:{id}` — every connection joins its own. Server → client DMs land here.
- `driver:{id}` — partners (+admins) only. Dispatch requests land here (Day 7).
- `booking:{id}` — joined explicitly via `booking:join` (must be a party).

Client → server:
- `booking:join { bookingId }` → ack `{ ok, room?, status? }`
- `booking:leave { bookingId }` → ack `{ ok }`
- Day 6: `driver:location { lat, lng }`, `tracking:subscribe { driverId }`

Server → client:
- `connected { userId, rooms }` — right after connect
- `booking:updated { booking }` — on accept/cancel/complete (Day 7 adds request/accept)
- Day 6: `driver:moved { driverId, lat, lng, at }`
