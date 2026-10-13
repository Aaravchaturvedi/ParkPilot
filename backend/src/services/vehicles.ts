import type { Vehicle } from '@prisma/client';
import prisma from '../lib/prisma';
import { coded } from '../middleware/async';

const CATEGORIES = ['HATCHBACK', 'SEDAN', 'SUV'];

export interface CreateVehicleInput {
  plateNumber: string;
  make?: string;
  model?: string;
  category?: string;
}

export async function createVehicle(ownerId: string, input: CreateVehicleInput): Promise<Vehicle> {
  const { plateNumber, make, model, category } = input;
  if (!plateNumber) throw coded(400, 'plateNumber_required');
  if (category && !CATEGORIES.includes(category)) throw coded(400, 'invalid_category');
  const existing = await prisma.vehicle.findUnique({ where: { plateNumber } });
  if (existing) throw coded(409, 'plate_taken');
  return prisma.vehicle.create({
    data: {
      ownerId,
      plateNumber,
      make: make || null,
      model: model || null,
      category: (category || 'HATCHBACK') as Vehicle['category'],
    },
  });
}

export async function myVehicles(ownerId: string): Promise<Vehicle[]> {
  return prisma.vehicle.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' } });
}

export async function updateVehicle(ownerId: string, id: string, patch: { isActive?: boolean }): Promise<Vehicle> {
  const v = await prisma.vehicle.findUnique({ where: { id } });
  if (!v) throw coded(404, 'vehicle_not_found');
  if (v.ownerId !== ownerId) throw coded(403, 'not_your_vehicle');
  const data: { isActive?: boolean } = {};
  if (patch.isActive !== undefined) data.isActive = Boolean(patch.isActive);
  return prisma.vehicle.update({ where: { id }, data });
}
