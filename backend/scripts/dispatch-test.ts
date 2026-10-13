// Day 7: nearby dispatch + socket accept/reject.
// Usage: BASE=http://localhost:4002 npx tsx scripts/dispatch-test.ts
import { io, type Socket } from 'socket.io-client';
import prisma from '../src/lib/prisma';
import { getRedis } from '../src/lib/redis';

const BASE = process.env.BASE || 'http://localhost:4000';

async function rest(method: string, path: string, token: string | null, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

function connect(token: string): Promise<{ socket: Socket; payload: unknown }> {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { auth: { token }, reconnection: false });
    s.once('connect_error', (e: Error) => {
      s.close();
      reject(new Error(e.message));
    });
    s.once('connected', (p: unknown) => resolve({ socket: s, payload: p }));
    setTimeout(() => {
      s.close();
      reject(new Error('connect_timeout'));
    }, 5000);
  });
}

const once = (s: Socket, evt: string, ms = 5000): Promise<Record<string, unknown>> =>
  new Promise((res, rej) => {
    s.once(evt, (m: Record<string, unknown>) => res(m));
    setTimeout(() => rej(new Error(`no ${evt}`)), ms);
  });

interface Reg {
  accessToken: string;
  user: { id: string };
}

(async () => {
  const t = Date.now();
  const cus = (await rest('POST', '/auth/register', null, { name: 'C', email: `c${t}@t.com`, password: 'secret123' })).json as unknown as Reg;
  const near = (await rest('POST', '/auth/register', null, { name: 'N', email: `n${t}@t.com`, password: 'secret123', role: 'PARTNER' })).json as unknown as Reg;
  const far = (await rest('POST', '/auth/register', null, { name: 'F', email: `f${t}@t.com`, password: 'secret123', role: 'PARTNER' })).json as unknown as Reg;

  const c = await connect(cus.accessToken);
  const n = await connect(near.accessToken);
  const f = await connect(far.accessToken);

  // near driver in CP Delhi, far driver in Mumbai
  await n.socket.emitWithAck('driver:location', { lat: 28.6139, lng: 77.209 });
  await f.socket.emitWithAck('driver:location', { lat: 19.076, lng: 72.8777 });

  // booking near CP -> only near partner gets request
  const reqNear = once(n.socket, 'booking:request');
  const reqFar = once(f.socket, 'booking:request', 2500)
    .then(() => 'LEAKED')
    .catch(() => 'none');
  const b = await rest('POST', '/bookings', cus.accessToken, { type: 'DRIVER', distanceKm: 5, pickupLat: 28.62, pickupLng: 77.21 });
  const bj = b.json as unknown as { booking: { id: string }; notified: string[] };
  console.log('notified:', JSON.stringify(bj.notified));
  const got = await reqNear;
  console.log('far gets:', await reqFar);
  if ((got.booking as { id: string }).id !== bj.booking.id) throw new Error('wrong booking dispatched');

  // socket accept -> customer receives booking:accepted + room update
  await c.socket.emitWithAck('booking:join', { bookingId: bj.booking.id });
  const accepted = once(c.socket, 'booking:accepted');
  const updated = once(c.socket, 'booking:updated');
  const accAck = (await n.socket.emitWithAck('booking:accept', { bookingId: bj.booking.id })) as { ok: boolean };
  const accEvt = (await accepted).booking as { status: string };
  const updEvt = (await updated).booking as { status: string };
  console.log('accept ack:', accAck.ok, '| accepted:', accEvt.status, '| updated:', updEvt.status);

  // second booking rejected by far partner -> customer notified, status stays REQUESTED
  const b2 = await rest('POST', '/bookings', cus.accessToken, { type: 'DRIVER', distanceKm: 3, pickupLat: 19.08, pickupLng: 72.88 });
  const b2j = b2.json as unknown as { booking: { id: string } };
  const rejected = once(c.socket, 'booking:rejected');
  const rejAck = (await f.socket.emitWithAck('booking:reject', { bookingId: b2j.booking.id })) as { ok: boolean };
  const rejEvt = (await rejected) as { bookingId: string };
  const still = await rest('GET', `/bookings/${b2j.booking.id}`, cus.accessToken);
  const status = ((still.json as unknown as { booking: { status: string } }).booking).status;
  console.log('reject ack:', rejAck.ok, '| event:', rejEvt.bookingId === b2j.booking.id, '| status:', status);
  if (status !== 'REQUESTED') throw new Error('reject changed state');

  c.socket.close();
  n.socket.close();
  f.socket.close();
  await prisma.booking.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
  const r = getRedis();
  for (const u of [near.user.id, far.user.id]) await r.del(`driver:meta:${u}`);
  await r.del('drivers:live');
  r.disconnect();
  console.log('DAY7 DISPATCH TEST PASS');
})().catch((e: unknown) => {
  console.error('FAIL:', (e as Error).message);
  process.exit(1);
});
