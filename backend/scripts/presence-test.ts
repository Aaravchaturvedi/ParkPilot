// Presence test: online toggle drives dispatch (no GPS needed).
// Usage: BASE=http://localhost:4000 npx tsx scripts/presence-test.ts
import { io, type Socket } from 'socket.io-client';
import prisma from '../src/lib/prisma';
import { getRedis } from '../src/lib/redis';

const BASE = process.env.BASE || 'http://localhost:4000';

async function rest(method: string, path: string, token: string | null, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await res.json()) as Record<string, unknown>;
}

function connect(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { auth: { token }, reconnection: false });
    s.once('connect_error', (e: Error) => {
      s.close();
      reject(new Error(e.message));
    });
    s.once('connected', () => resolve(s));
    setTimeout(() => {
      s.close();
      reject(new Error('connect_timeout'));
    }, 5000);
  });
}

interface Reg {
  accessToken: string;
  user: { id: string };
}

interface Created {
  booking: { id: string };
  notified: string[];
}

(async () => {
  const t = Date.now();
  const par = (await rest('POST', '/auth/register', null, { name: 'P', email: `pon${t}@t.com`, password: 'secret123', role: 'PARTNER' })) as unknown as Reg;
  const cus = (await rest('POST', '/auth/register', null, { name: 'C', email: `con${t}@t.com`, password: 'secret123' })) as unknown as Reg;
  const d = await connect(par.accessToken);

  // offline partner gets nothing
  let b = (await rest('POST', '/bookings', cus.accessToken, { type: 'DRIVER', distanceKm: 5 })) as unknown as Created;
  console.log('offline notified:', JSON.stringify(b.notified));
  if (b.notified.length !== 0) throw new Error('offline partner was notified');

  // go online -> notified, and request actually arrives
  await d.emitWithAck('partner:online', {});
  const req = new Promise<Record<string, unknown>>((res, rej) => {
    d.once('booking:request', (m: Record<string, unknown>) => res(m));
    setTimeout(() => rej(new Error('no booking:request')), 5000);
  });
  b = (await rest('POST', '/bookings', cus.accessToken, { type: 'DRIVER', distanceKm: 5 })) as unknown as Created;
  console.log('online notified:', JSON.stringify(b.notified));
  const got = (await req).booking as { id: string };
  if (!b.notified.includes(par.user.id) || got.id !== b.booking.id) throw new Error('online partner missed');

  // go offline -> nothing again
  await d.emitWithAck('partner:offline', {});
  b = (await rest('POST', '/bookings', cus.accessToken, { type: 'DRIVER', distanceKm: 5 })) as unknown as Created;
  console.log('offline-again notified:', JSON.stringify(b.notified));
  if (b.notified.length !== 0) throw new Error('offline partner was notified');

  d.close();
  await prisma.booking.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
  const r = getRedis();
  await r.del('partners:online');
  r.disconnect();
  console.log('PRESENCE TEST PASS');
})().catch((e: unknown) => {
  console.error('FAIL:', (e as Error).message);
  process.exit(1);
});
