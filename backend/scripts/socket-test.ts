// Day 5 socket verification (reused/extended Days 6-8).
// Usage: BASE=http://localhost:4002 npx tsx scripts/socket-test.ts
import { io, type Socket } from 'socket.io-client';
import prisma from '../src/lib/prisma';

const BASE = process.env.BASE || 'http://localhost:4000';

async function rest(method: string, path: string, token: string | null, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

function connect(token: string | null): Promise<{ socket: Socket; payload: unknown }> {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { auth: token ? { token } : {}, reconnection: false });
    s.once('connect_error', (e: Error) => {
      s.close();
      reject(new Error(e.message));
    });
    s.once('connected', (payload: unknown) => resolve({ socket: s, payload }));
    setTimeout(() => {
      s.close();
      reject(new Error('connect_timeout'));
    }, 5000);
  });
}

interface Tokens {
  accessToken: string;
}

(async () => {
  // 1. no token -> rejected
  try {
    await connect(null);
    console.log('FAIL: anonymous connected');
    process.exit(1);
  } catch (e) {
    console.log('no-token rejected:', (e as Error).message);
  }

  // 2. users + tokens
  const cus = await rest('POST', '/auth/register', null, { name: 'S', email: `s${Date.now()}@t.com`, password: 'secret123' });
  const par = await rest('POST', '/auth/register', null, { name: 'D', email: `d${Date.now()}@t.com`, password: 'secret123', role: 'PARTNER' });
  const CT = (cus.json as unknown as Tokens).accessToken;
  const PT = (par.json as unknown as Tokens).accessToken;

  // 3. authed connect
  const { socket, payload } = await connect(CT);
  console.log('connected:', JSON.stringify(payload));

  // 4. booking room join + live update on accept
  const b = await rest('POST', '/bookings', CT, { type: 'DRIVER', distanceKm: 5 });
  const bookingId = ((b.json as unknown as { booking: { id: string } }).booking).id;
  const joinAck = await socket.emitWithAck('booking:join', { bookingId });
  console.log('join:', JSON.stringify(joinAck));
  const updated = new Promise<unknown>((res) => socket.once('booking:updated', res));
  await rest('PATCH', `/bookings/${bookingId}/accept`, PT);
  const evt = (await Promise.race([
    updated,
    new Promise((_, rej) => setTimeout(() => rej(new Error('no booking:updated')), 5000)),
  ])) as { booking: { status: string } };
  console.log('live update status:', evt.booking.status);

  // 5. outsider cannot join
  const outsiderReg = await rest('POST', '/auth/register', null, { name: 'X', email: `x${Date.now()}@t.com`, password: 'secret123' });
  const outsider = await connect((outsiderReg.json as unknown as Tokens).accessToken);
  const denied = await outsider.socket.emitWithAck('booking:join', { bookingId });
  console.log('outsider join:', JSON.stringify(denied));

  socket.close();
  outsider.socket.close();

  // cleanup: ONLY rows this test created (never touch other users)
  const ids = [cus.json, par.json, outsiderReg.json].map((j) => (j as unknown as { user: { id: string } }).user.id);
  await prisma.booking.deleteMany({ where: { OR: [{ customerId: { in: ids } }, { partnerId: { in: ids } }] } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
  console.log('DAY5 SOCKET TEST PASS');
})().catch((e: unknown) => {
  console.error('FAIL:', (e as Error).message);
  process.exit(1);
});
