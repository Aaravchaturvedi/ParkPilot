// Day 5 socket verification (reused/extended Days 6-8).
// Usage: BASE=http://localhost:4002 node scripts/socket-test.js
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
    const s = io(BASE, { auth: token ? { token } : {}, reconnection: false });
    s.once('connect_error', (e) => { s.close(); reject(new Error(e.message)); });
    s.once('connected', (payload) => resolve({ socket: s, payload }));
    setTimeout(() => { s.close(); reject(new Error('connect_timeout')); }, 5000);
  });
}

(async () => {
  // 1. no token -> rejected
  try { await connect(null); console.log('FAIL: anonymous connected'); process.exit(1); }
  catch (e) { console.log('no-token rejected:', e.message); }

  // 2. users + tokens
  const cus = await rest('POST', '/auth/register', null, { name: 'S', email: `s${Date.now()}@t.com`, password: 'secret123' });
  const par = await rest('POST', '/auth/register', null, { name: 'D', email: `d${Date.now()}@t.com`, password: 'secret123', role: 'PARTNER' });
  const CT = cus.json.accessToken, PT = par.json.accessToken;

  // 3. authed connect
  const { socket, payload } = await connect(CT);
  console.log('connected:', JSON.stringify(payload));

  // 4. booking room join + live update on accept
  const b = await rest('POST', '/bookings', CT, { type: 'DRIVER', distanceKm: 5 });
  const joinAck = await socket.emitWithAck('booking:join', { bookingId: b.json.booking.id });
  console.log('join:', JSON.stringify(joinAck));
  const updated = new Promise((res) => socket.once('booking:updated', res));
  await rest('PATCH', `/bookings/${b.json.booking.id}/accept`, PT);
  const evt = await Promise.race([updated, new Promise((_, rej) => setTimeout(() => rej(new Error('no booking:updated')), 5000))]);
  console.log('live update status:', evt.booking.status);

  // 5. outsider cannot join
  const outsider = await connect((await rest('POST', '/auth/register', null, { name: 'X', email: `x${Date.now()}@t.com`, password: 'secret123' })).json.accessToken);
  const denied = await outsider.socket.emitWithAck('booking:join', { bookingId: b.json.booking.id });
  console.log('outsider join:', JSON.stringify(denied));

  socket.close(); outsider.socket.close();

  // cleanup
  const prisma = require('../src/lib/prisma');
  await prisma.booking.deleteMany(); await prisma.user.deleteMany(); await prisma.$disconnect();
  console.log('DAY5 SOCKET TEST PASS');
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
