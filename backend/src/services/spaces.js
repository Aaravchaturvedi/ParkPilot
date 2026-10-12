const prisma = require('../lib/prisma');

// Haversine km. MVP filter (PostGIS is Phase A).
function distKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const dLa = ((bLat - aLat) * Math.PI) / 180;
  const dLn = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLa / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function nearbySpaces(lat, lng, radiusKm = 5) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    const e = new Error('invalid_coords');
    e.status = 400;
    throw e;
  }
  const spaces = await prisma.parkingSpace.findMany({ where: { isActive: true }, take: 200 });
  return spaces
    .map((s) => ({ ...s, distanceKm: Math.round(distKm(lat, lng, s.lat, s.lng) * 100) / 100 }))
    .filter((s) => s.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 20);
}

module.exports = { nearbySpaces };
