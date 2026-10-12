const { getRedis } = require('../lib/redis');

const LIVE_KEY = 'drivers:live'; // GEO: lng, lat, driverId
const FRESH_MS = 90 * 1000; // positions older than this are stale
const metaKey = (id) => `driver:meta:${id}`;

function validCoord(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function trackingRoom(driverId) {
  return `tracking:${driverId}`;
}

async function lastKnown(driverId) {
  const meta = await getRedis().hgetall(metaKey(driverId));
  if (!meta || meta.lat === undefined) return null;
  return { lat: Number(meta.lat), lng: Number(meta.lng), at: Number(meta.at) };
}

async function isFresh(driverId) {
  const last = await lastKnown(driverId);
  return Boolean(last && Date.now() - last.at < FRESH_MS);
}

// GEO members don't expire; callers must filter by freshness (see dispatch.js Day 7).
async function nearbyDrivers(lng, lat, radiusKm = 5, limit = 10) {
  const r = getRedis();
  const found = await r.georadius(LIVE_KEY, lng, lat, radiusKm, 'km', 'COUNT', limit, 'ASC');
  const fresh = [];
  for (const id of found) {
    if (await isFresh(id)) fresh.push(id);
    else await r.zrem(LIVE_KEY, id); // sweep stale member
  }
  return fresh;
}

async function liveDriverIds(limit = 50) {
  const r = getRedis();
  const ids = await r.zrange(LIVE_KEY, 0, limit - 1);
  const fresh = [];
  for (const id of ids) {
    if (await isFresh(id)) fresh.push(id);
    else await r.zrem(LIVE_KEY, id);
  }
  return fresh;
}

function registerLocationHandlers(io, socket) {
  const { id, role } = socket.data.user;

  socket.on('driver:location', async ({ lat, lng } = {}, ack) => {
    try {
      if (role !== 'PARTNER' && role !== 'ADMIN') return ack?.({ ok: false, error: 'only_partners_broadcast' });
      if (!validCoord(lat, lng)) return ack?.({ ok: false, error: 'invalid_coords' });
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

  socket.on('tracking:subscribe', async ({ driverId } = {}, ack) => {
    try {
      if (!driverId) return ack?.({ ok: false, error: 'driverId_required' });
      socket.join(trackingRoom(driverId));
      ack?.({ ok: true, room: trackingRoom(driverId), last: await lastKnown(driverId) });
    } catch {
      ack?.({ ok: false, error: 'subscribe_failed' });
    }
  });

  socket.on('tracking:unsubscribe', ({ driverId } = {}, ack) => {
    socket.leave(trackingRoom(driverId));
    ack?.({ ok: true });
  });
}

module.exports = { registerLocationHandlers, nearbyDrivers, liveDriverIds, lastKnown, trackingRoom, LIVE_KEY };
