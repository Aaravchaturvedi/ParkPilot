import type { ParkingSpace } from '@prisma/client';
import prisma from '../lib/prisma';
import { coded } from '../middleware/async';

// Haversine km. MVP filter (PostGIS is Phase A).
function distKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLa = ((bLat - aLat) * Math.PI) / 180;
  const dLn = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLa / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function assertCoords(lat: number, lng: number): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw coded(400, 'invalid_coords');
  }
}

export type SpaceWithDistance = ParkingSpace & { distanceKm: number };

export async function nearbySpaces(lat: number, lng: number, radiusKm = 5): Promise<SpaceWithDistance[]> {
  assertCoords(lat, lng);
  const spaces = await prisma.parkingSpace.findMany({ where: { isActive: true }, take: 200 });
  return spaces
    .map((s) => ({ ...s, distanceKm: Math.round(distKm(lat, lng, s.lat, s.lng) * 100) / 100 }))
    .filter((s) => s.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 20);
}

export interface CreateSpaceInput {
  title: string;
  address: string;
  lat: number;
  lng: number;
  pricePerHourPaise: number;
}

export async function createSpace(ownerId: string, input: CreateSpaceInput): Promise<ParkingSpace> {
  const { title, address, lat, lng, pricePerHourPaise } = input;
  if (!title || !address) throw coded(400, 'title_address_required');
  assertCoords(lat, lng);
  if (!Number.isInteger(pricePerHourPaise) || pricePerHourPaise <= 0) throw coded(400, 'pricePerHourPaise_must_be_positive_int');
  return prisma.parkingSpace.create({ data: { ownerId, title, address, lat, lng, pricePerHourPaise } });
}

export async function mySpaces(ownerId: string): Promise<ParkingSpace[]> {
  return prisma.parkingSpace.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' } });
}

export interface SpacePatch {
  title?: string;
  address?: string;
  pricePerHourPaise?: number;
  isActive?: boolean;
  lat?: number;
  lng?: number;
}

export async function updateSpace(ownerId: string, id: string, patch: SpacePatch): Promise<ParkingSpace> {
  const s = await prisma.parkingSpace.findUnique({ where: { id } });
  if (!s) throw coded(404, 'space_not_found');
  if (s.ownerId !== ownerId) throw coded(403, 'not_your_space');
  const data: SpacePatch = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.address !== undefined) data.address = patch.address;
  if (patch.pricePerHourPaise !== undefined) {
    if (!Number.isInteger(patch.pricePerHourPaise) || patch.pricePerHourPaise <= 0) throw coded(400, 'pricePerHourPaise_must_be_positive_int');
    data.pricePerHourPaise = patch.pricePerHourPaise;
  }
  if (patch.isActive !== undefined) data.isActive = Boolean(patch.isActive);
  if (patch.lat !== undefined || patch.lng !== undefined) {
    const lat = patch.lat ?? s.lat;
    const lng = patch.lng ?? s.lng;
    assertCoords(lat, lng);
    data.lat = lat;
    data.lng = lng;
  }
  return prisma.parkingSpace.update({ where: { id }, data });
}
