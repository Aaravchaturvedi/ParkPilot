const prisma = require('../lib/prisma');
const { coded } = require('../middleware/async');

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

function assertCoords(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw coded(400, 'invalid_coords');
  }
}

async function nearbySpaces(lat, lng, radiusKm = 5) {
  assertCoords(lat, lng);
  const spaces = await prisma.parkingSpace.findMany({ where: { isActive: true }, take: 200 });
  return spaces
    .map((s) => ({ ...s, distanceKm: Math.round(distKm(lat, lng, s.lat, s.lng) * 100) / 100 }))
    .filter((s) => s.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 20);
}

async function createSpace(ownerId, { title, address, lat, lng, pricePerHourPaise }) {
  if (!title || !address) throw coded(400, 'title_address_required');
  assertCoords(lat, lng);
  if (!Number.isInteger(pricePerHourPaise) || pricePerHourPaise <= 0) throw coded(400, 'pricePerHourPaise_must_be_positive_int');
  return prisma.parkingSpace.create({ data: { ownerId, title, address, lat, lng, pricePerHourPaise } });
}

async function mySpaces(ownerId) {
  return prisma.parkingSpace.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' } });
}

async function updateSpace(ownerId, id, patch) {
  const s = await prisma.parkingSpace.findUnique({ where: { id } });
  if (!s) throw coded(404, 'space_not_found');
  if (s.ownerId !== ownerId) throw coded(403, 'not_your_space');
  const data = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.address !== undefined) data.address = patch.address;
  if (patch.pricePerHourPaise !== undefined) {
    if (!Number.isInteger(patch.pricePerHourPaise) || patch.pricePerHourPaise <= 0) throw coded(400, 'pricePerHourPaise_must_be_positive_int');
    data.pricePerHourPaise = patch.pricePerHourPaise;
  }
  if (patch.isActive !== undefined) data.isActive = Boolean(patch.isActive);
  return prisma.parkingSpace.update({ where: { id }, data });
}

module.exports = { nearbySpaces, createSpace, mySpaces, updateSpace };
