import type { Server, Socket } from 'socket.io';
import prisma from '../lib/prisma';
import { BOOKING_FULL, type FullBooking } from '../services/bookings';
import { getRedis } from '../lib/redis';

const LIVE_KEY = 'drivers:live'; // GEO: lng, lat, driverId
const FRESH_MS = 90 * 1000; // positions older than this are stale
const metaKey = (id: string): string => `driver:meta:${id}`;

function validCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function trackingRoom(driverId: string): string {
  return `tracking:${driverId}`;
}

export const ONLINE_PARTNERS_KEY = 'partners:online';

// Explicit presence: set by the partner app's online toggle, NOT by mere
// connection (an open app with toggle OFF must not receive dispatches).
// Disconnect clears it as a safety net; the client re-emits online on
// reconnect while its toggle is ON.
export async function onlinePartnerIds(): Promise<string[]> {
  return getRedis().smembers(ONLINE_PARTNERS_KEY);
}

export interface LastKnown {
  lat: number;
  lng: number;
  at: number;
}

export async function lastKnown(driverId: string): Promise<LastKnown | null> {
  const meta = (await getRedis().hgetall(metaKey(driverId))) as Record<string, string> | null;
  if (!meta || meta.lat === undefined) return null;
  return { lat: Number(meta.lat), lng: Number(meta.lng), at: Number(meta.at) };
}

export async function isFresh(driverId: string): Promise<boolean> {
  const last = await lastKnown(driverId);
  return Boolean(last && Date.now() - last.at < FRESH_MS);
}

// GEO members don't expire; callers must filter by freshness (see dispatch.ts Day 7).
export async function nearbyDrivers(lng: number, lat: number, radiusKm = 5, limit = 10): Promise<string[]> {
  const r = getRedis();
  const found = (await r.georadius(LIVE_KEY, lng, lat, radiusKm, 'km', 'COUNT', limit, 'ASC')) as string[];
  const fresh: string[] = [];
  for (const id of found) {
    if (await isFresh(id)) fresh.push(id);
    else await r.zrem(LIVE_KEY, id); // sweep stale member
  }
  return fresh;
}

export async function liveDriverIds(limit = 50): Promise<string[]> {
  const r = getRedis();
  const ids = (await r.zrange(LIVE_KEY, 0, limit - 1)) as string[];
  const fresh: string[] = [];
  for (const id of ids) {
    if (await isFresh(id)) fresh.push(id);
    else await r.zrem(LIVE_KEY, id);
  }
  return fresh;
}

type Ack = (res: { ok: boolean; at?: number; error?: string; room?: string; last?: LastKnown | null }) => void;

export function registerLocationHandlers(io: Server, socket: Socket): void {
  const { id, role } = socket.data.user as { id: string; role: string };

  socket.on('driver:location', async ({ lat, lng }: { lat?: number; lng?: number } = {}, ack?: Ack) => {
    try {
      if (role !== 'PARTNER' && role !== 'ADMIN') {
        ack?.({ ok: false, error: 'only_partners_broadcast' });
        return;
      }
      if (typeof lat !== 'number' || typeof lng !== 'number' || !validCoord(lat, lng)) {
        ack?.({ ok: false, error: 'invalid_coords' });
        return;
      }
      const at = Date.now();
      const r = getRedis();
      await r.geoadd(LIVE_KEY, lng, lat, id);
      await r.hset(metaKey(id), { lat, lng, at });
      await r.expire(metaKey(id), 300);
      io.to(trackingRoom(id)).emit('driver:moved', { driverId: id, lat, lng, at });
      ack?.({ ok: true, at });
    } catch {
      ack?.({ ok: false, error: 'store_failed' });
    }
  });

  socket.on('tracking:subscribe', async ({ driverId }: { driverId?: string } = {}, ack?: Ack) => {
    try {
      if (!driverId) {
        ack?.({ ok: false, error: 'driverId_required' });
        return;
      }
      await socket.join(trackingRoom(driverId));
      ack?.({ ok: true, room: trackingRoom(driverId), last: await lastKnown(driverId) });
    } catch {
      ack?.({ ok: false, error: 'subscribe_failed' });
    }
  });

  socket.on('tracking:unsubscribe', ({ driverId }: { driverId?: string } = {}, ack?: Ack) => {
    void socket.leave(trackingRoom(driverId as string));
    ack?.({ ok: true });
  });

  socket.on('partner:online', async (_payload: unknown, ack?: Ack) => {
    try {
      if (role !== 'PARTNER' && role !== 'ADMIN') {
        ack?.({ ok: false, error: 'only_partners' });
        return;
      }
      await getRedis().sadd(ONLINE_PARTNERS_KEY, id);
      // Redeliver open requests missed while offline/restarted: dispatch is
      // fire-once, so without this a booking created pre-online never appears.
      // DRIVER bookings are broadcast to every online partner; PARKING
      // bookings belong to one owner and must be redelivered to that owner.
      const openDriver = (await prisma.booking.findMany({
        where: { type: 'DRIVER', status: 'REQUESTED', partnerId: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: BOOKING_FULL,
      })) as FullBooking[];
      for (const booking of openDriver) socket.emit('booking:request', { booking });
      const openParking = (await prisma.booking.findMany({
        where: { type: 'PARKING', status: 'REQUESTED', partnerId: null, space: { ownerId: id } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: BOOKING_FULL,
      })) as FullBooking[];
      for (const booking of openParking) socket.emit('booking:request', { booking });
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'presence_failed' });
    }
  });

  socket.on('partner:offline', async (_payload: unknown, ack?: Ack) => {
    try {
      await getRedis().srem(ONLINE_PARTNERS_KEY, id);
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'presence_failed' });
    }
  });
}

export { LIVE_KEY };
