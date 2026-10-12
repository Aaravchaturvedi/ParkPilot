const prisma = require('../lib/prisma');
const { coded } = require('../middleware/async');

const CATEGORIES = ['HATCHBACK', 'SEDAN', 'SUV'];

async function createVehicle(ownerId, { plateNumber, make, model, category }) {
  if (!plateNumber) throw coded(400, 'plateNumber_required');
  if (category && !CATEGORIES.includes(category)) throw coded(400, 'invalid_category');
  const existing = await prisma.vehicle.findUnique({ where: { plateNumber } });
  if (existing) throw coded(409, 'plate_taken');
  return prisma.vehicle.create({
    data: { ownerId, plateNumber, make: make || null, model: model || null, category: category || 'HATCHBACK' },
  });
}

async function myVehicles(ownerId) {
  return prisma.vehicle.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' } });
}

async function updateVehicle(ownerId, id, patch) {
  const v = await prisma.vehicle.findUnique({ where: { id } });
  if (!v) throw coded(404, 'vehicle_not_found');
  if (v.ownerId !== ownerId) throw coded(403, 'not_your_vehicle');
  const data = {};
  if (patch.isActive !== undefined) data.isActive = Boolean(patch.isActive);
  return prisma.vehicle.update({ where: { id }, data });
}

module.exports = { createVehicle, myVehicles, updateVehicle };
