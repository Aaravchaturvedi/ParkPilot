// Day 8: mock moving driver + delivery-latency measurement.
// Usage: BASE=http://localhost:4002 STEPS=60 INTERVAL_MS=500 npx tsx scripts/simulate-driver.ts
import { io } from 'socket.io-client';
import prisma from '../src/lib/prisma';
import { getRedis } from '../src/lib/redis';

const BASE = process.env.BASE || 'http://localhost:4000';
const STEPS = Number(process.env.STEPS || 60);
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 500);
// CP Delhi -> Karol Bagh-ish straight line
const FROM = { lat: 28.6315, lng: 77.2167 };
const TO = { lat: 28.6519, lng: 77.191 };

async function rest(method: string, path: string, token: string | null, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await res.json()) as Record<string, unknown>;
}

function connect(token: string): Promise<ReturnType<typeof io>> {
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

const pct = (arr: number[], p: number): number => arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))];

interface Reg {
  accessToken: string;
  user: { id: string };
}

(async () => {
  const t = Date.now();
  const par = (await rest('POST', '/auth/register', null, { name: 'Sim', email: `sim${t}@t.com`, password: 'secret123', role: 'PARTNER' })) as unknown as Reg;
  const cus = (await rest('POST', '/auth/register', null, { name: 'Watch', email: `watch${t}@t.com`, password: 'secret123' })) as unknown as Reg;
  const driver = await connect(par.accessToken);
  const watcher = await connect(cus.accessToken);
  await watcher.emitWithAck('tracking:subscribe', { driverId: par.user.id });

  const latencies: number[] = [];
  let received = 0;
  watcher.on('driver:moved', (m: { at: number }) => {
    received += 1;
    latencies.push(Date.now() - m.at); // same-machine clocks; measures pipe delay
  });

  for (let i = 0; i < STEPS; i += 1) {
    const f = STEPS === 1 ? 0 : i / (STEPS - 1);
    const lat = FROM.lat + (TO.lat - FROM.lat) * f;
    const lng = FROM.lng + (TO.lng - FROM.lng) * f;
    const ack = (await driver.emitWithAck('driver:location', { lat, lng })) as { ok: boolean };
    if (!ack.ok) throw new Error(`publish failed at step ${i}`);
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
  await new Promise((r) => setTimeout(r, 1000)); // drain

  latencies.sort((a, b) => a - b);
  console.log(`sent=${STEPS} received=${received} loss=${(((STEPS - received) / STEPS) * 100).toFixed(1)}%`);
  console.log(`latency ms: min=${latencies[0]} avg=${Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)} p95=${pct(latencies, 95)} max=${latencies[latencies.length - 1]}`);

  driver.close();
  watcher.close();
  // cleanup: ONLY rows this test created (never touch other users)
  await prisma.user.deleteMany({ where: { id: { in: [par.user.id, cus.user.id] } } });
  await prisma.$disconnect();
  const r = getRedis();
  await r.del('drivers:live', `driver:meta:${par.user.id}`);
  r.disconnect();

  if (received < STEPS) throw new Error('message loss detected');
  if (pct(latencies, 95) > 1000) throw new Error('p95 latency over 1000ms');
  console.log('DAY8 SIMULATOR TEST PASS');
})().catch((e: unknown) => {
  console.error('FAIL:', (e as Error).message);
  process.exit(1);
});
