// Day 7: nearby dispatch + socket accept/reject.
// Usage: BASE=http://localhost:4002 node scripts/dispatch-test.js
const { io } = require('socket.io-client');

const BASE = process.env.BASE || 'http://localhost:4000';

async function rest(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { auth: { token }, reconnection: false });
    s.once('connect_error', (e) => { s.close(); reject(new Error(e.message)); });
    s.once('connected', (p) => resolve({ socket: s, payload: p }));
    setTimeout(() => { s.close(); reject(new Error('connect_timeout')); }, 5000);
  });
}

const once = (s, evt, ms = 5000) => new Promise((res, rej) => {
  s.once(evt, res);
  setTimeout(() => rej(new Error(`no ${evt}`)), ms);
});

(async () => {
  const t = Date.now();
  const cus = (await rest('POST', '/auth/register', null, { name: 'C', email: `c${t}@t.com`, password: 'secret123' })).json;
  const near = (await rest('POST', '/auth/register', null, { name: 'N', email: `n${t}@t.com`, password: 'secret123', role: 'PARTNER' })).json;
  const far = (await rest('POST', '/auth/register', null, { name: 'F', email: `f${t}@t.com`, password: 'secret123', role: 'PARTNER' })).json;

  const c = await connect(cus.accessToken);
  const n = await connect(near.accessToken);
  const f = await connect(far.accessToken);

  // near driver in CP Delhi, far driver in Mumbai
  await n.socket.emitWithAck('driver:location', { lat: 28.6139, lng: 77.209 });
  await f.socket.emitWithAck('driver:location', { lat: 19.076, lng: 72.8777 });

  // booking near CP -> only near partner gets request
  const reqNear = once(n.socket, 'booking:request');
  const reqFar = once(f.socket, 'booking:request', 2500).then(() => 'LEAKED').catch(() => 'none');
  const b = await rest('POST', '/bookings', cus.accessToken, { type: 'DRIVER', distanceKm: 5, pickupLat: 28.62, pickupLng: 77.21 });
  console.log('notified:', JSON.stringify(b.json.notified));
  const got = await reqNear;
  console.log('far gets:', await reqFar);
  if (got.booking.id !== b.json.booking.id) throw new Error('wrong booking dispatched');

  // socket accept -> customer receives booking:accepted + room update
  await c.socket.emitWithAck('booking:join', { bookingId: b.json.booking.id });
  const accepted = once(c.socket, 'booking:accepted');
  const updated = once(c.socket, 'booking:updated');
  const accAck = await n.socket.emitWithAck('booking:accept', { bookingId: b.json.booking.id });
  console.log('accept ack:', accAck.ok, '| accepted:', (await accepted).booking.status, '| updated:', (await updated).booking.status);

  // second booking rejected by far partner -> customer notified, status stays REQUESTED
  const b2 = await rest('POST', '/bookings', cus.accessToken, { type: 'DRIVER', distanceKm: 3, pickupLat: 19.08, pickupLng: 72.88 });
  const rejected = once(c.socket, 'booking:rejected');
  const rejAck = await f.socket.emitWithAck('booking:reject', { bookingId: b2.json.booking.id });
  const rejEvt = await rejected;
  const still = await rest('GET', `/bookings/${b2.json.booking.id}`, cus.accessToken);
  console.log('reject ack:', rejAck.ok, '| event:', rejEvt.bookingId === b2.json.booking.id, '| status:', still.json.booking.status);
  if (still.json.booking.status !== 'REQUESTED') throw new Error('reject changed state');

  c.socket.close(); n.socket.close(); f.socket.close();
  const prisma = require('../src/lib/prisma');
  const { getRedis } = require('../src/lib/redis');
  await prisma.booking.deleteMany(); await prisma.user.deleteMany(); await prisma.$disconnect();
  const r = getRedis(); for (const u of [near.user.id, far.user.id]) await r.del(`driver:meta:${u}`); await r.del('drivers:live'); r.disconnect();
  console.log('DAY7 DISPATCH TEST PASS');
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
