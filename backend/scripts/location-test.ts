// Day 6: driver:location -> Redis GEO + tracking rooms.
// Usage: BASE=http://localhost:4002 npx tsx scripts/location-test.ts
import { io } from 'socket.io-client';
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

function connect(token: string): Promise<{ socket: ReturnType<typeof io>; payload: unknown }> {
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

interface Tokens {
  accessToken: string;
  user: { id: string };
}

(async () => {
  const t = Date.now();
  const cus = (await rest('POST', '/auth/register', null, { name: 'C', email: `c${t}@t.com`, password: 'secret123' })).json as unknown as Tokens;
  const par = (await rest('POST', '/auth/register', null, { name: 'D', email: `d${t}@t.com`, password: 'secret123', role: 'PARTNER' })).json as unknown as Tokens;
  const driverId = par.user.id;

  const c = await connect(cus.accessToken);
  const d = await connect(par.accessToken);

  // subscribe before any position -> last null
  const sub1 = await c.socket.emitWithAck('tracking:subscribe', { driverId });
  console.log('subscribe (no pos):', JSON.stringify(sub1));

  // live move -> customer receives driver:moved
  const moved = new Promise<Record<string, unknown>>((res, rej) => {
    c.socket.once('driver:moved', (m: Record<string, unknown>) => res(m));
    setTimeout(() => rej(new Error('no driver:moved')), 5000);
  });
  const pub = await d.socket.emitWithAck('driver:location', { lat: 28.6139, lng: 77.209 });
  const evt = await moved;
  console.log('publish ack:', JSON.stringify(pub), '| moved:', JSON.stringify(evt));

  // re-subscribe -> last known present
  const c2 = await connect(cus.accessToken);
  const sub2 = (await c2.socket.emitWithAck('tracking:subscribe', { driverId })) as { last?: { lat: number } };
  console.log('subscribe (has pos):', JSON.stringify(sub2));

  // negative: customer broadcasting + invalid coords
  console.log('customer broadcast:', JSON.stringify(await c.socket.emitWithAck('driver:location', { lat: 1, lng: 1 })));
  console.log('invalid coords:', JSON.stringify(await d.socket.emitWithAck('driver:location', { lat: 999, lng: 0 })));

  if (evt.lat !== 28.6139 || evt.lng !== 77.209 || evt.driverId !== driverId) throw new Error('coords mismatch');
  if (!(pub as { ok: boolean }).ok || !sub2.last || sub2.last.lat !== 28.6139) throw new Error('redis store mismatch');

  c.socket.close();
  d.socket.close();
  c2.socket.close();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
  const r = getRedis();
  await r.del('drivers:live', `driver:meta:${driverId}`);
  r.disconnect();
  console.log('DAY6 LOCATION TEST PASS');
})().catch((e: unknown) => {
  console.error('FAIL:', (e as Error).message);
  process.exit(1);
});
