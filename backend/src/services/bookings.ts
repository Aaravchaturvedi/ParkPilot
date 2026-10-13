import type { Booking, Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { coded } from '../middleware/async';
import { quoteDriverFare, quoteParkingFare, DEFAULT_COMMISSION_BPS } from './pricing';

const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  kycStatus: true,
  createdAt: true,
} as const;

const BOOKING_FULL: Prisma.BookingInclude = {
  customer: { select: PUBLIC_USER_SELECT },
  partner: { select: PUBLIC_USER_SELECT },
  vehicle: true,
  space: true,
};

export type FullBooking = Booking & {
  customer: { id: string; name: string; email: string; phone: string | null; role: string; kycStatus: string; createdAt: Date };
  partner: { id: string; name: string; email: string; phone: string | null; role: string; kycStatus: string; createdAt: Date } | null;
};

const MIN_BPS = 2000; // 20%
const MAX_BPS = 2500; // 25%

function bpsOrDefault(bps: number | undefined): number {
  if (bps === undefined) return DEFAULT_COMMISSION_BPS;
  if (!Number.isInteger(bps) || bps < MIN_BPS || bps > MAX_BPS) throw coded(400, 'commissionBps_out_of_range_2000_2500');
  return bps;
}

export interface DriverBookingInput {
  customerId: string;
  distanceKm: number;
  vehicleId?: string;
  pickupLat?: number;
  pickupLng?: number;
  dropLat?: number;
  dropLng?: number;
  commissionBps?: number;
}

export interface ParkingBookingInput {
  customerId: string;
  spaceId: string;
  hours: number;
  commissionBps?: number;
}

export async function createDriverBooking(input: DriverBookingInput): Promise<FullBooking> {
  const { customerId, distanceKm, vehicleId, pickupLat, pickupLng, dropLat, dropLng, commissionBps } = input;
  if (!(distanceKm > 0)) throw coded(400, 'distanceKm_must_be_positive');
  let vehicle = null;
  if (vehicleId) {
    vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle || !vehicle.isActive) throw coded(404, 'vehicle_not_available');
  }
  const q = quoteDriverFare(distanceKm, bpsOrDefault(commissionBps));
  return prisma.booking.create({
    data: {
      type: 'DRIVER',
      status: 'REQUESTED',
      customerId,
      vehicleId: vehicle ? vehicle.id : null,
      pickupLat: pickupLat ?? null,
      pickupLng: pickupLng ?? null,
      dropLat: dropLat ?? null,
      dropLng: dropLng ?? null,
      distanceKm,
      amountPaise: q.amountPaise,
      commissionBps: q.commissionBps,
      platformFeePaise: q.platformFeePaise,
      partnerPayoutPaise: q.partnerPayoutPaise,
    },
    include: BOOKING_FULL,
  }) as Promise<FullBooking>;
}

export async function createParkingBooking(input: ParkingBookingInput): Promise<FullBooking> {
  const { customerId, spaceId, hours, commissionBps } = input;
  if (!spaceId) throw coded(400, 'spaceId_required');
  if (!(hours > 0)) throw coded(400, 'hours_must_be_positive');
  const space = await prisma.parkingSpace.findUnique({ where: { id: spaceId } });
  if (!space || !space.isActive) throw coded(404, 'space_not_available');
  const q = quoteParkingFare(space.pricePerHourPaise, hours, bpsOrDefault(commissionBps));
  return prisma.booking.create({
    data: {
      type: 'PARKING',
      status: 'REQUESTED',
      customerId,
      spaceId: space.id,
      amountPaise: q.amountPaise,
      commissionBps: q.commissionBps,
      platformFeePaise: q.platformFeePaise,
      partnerPayoutPaise: q.partnerPayoutPaise,
    },
    include: BOOKING_FULL,
  }) as Promise<FullBooking>;
}

export async function getOwnBookings(userId: string): Promise<FullBooking[]> {
  return prisma.booking.findMany({
    where: {
      OR: [{ customerId: userId }, { partnerId: userId }, { space: { ownerId: userId } }],
    },
    orderBy: { createdAt: 'desc' },
    include: BOOKING_FULL,
  }) as Promise<FullBooking[]>;
}

export async function getBookingForParty(bookingId: string, userId: string): Promise<FullBooking> {
  const b = (await prisma.booking.findUnique({ where: { id: bookingId }, include: BOOKING_FULL })) as FullBooking | null;
  if (!b) throw coded(404, 'booking_not_found');
  if (b.customerId !== userId && b.partnerId !== userId) throw coded(403, 'not_your_booking');
  return b;
}

// Day 7 sockets reuse these transitions.
export async function acceptBooking(bookingId: string, partnerId: string): Promise<FullBooking> {
  const partner = await prisma.user.findUnique({ where: { id: partnerId } });
  if (!partner || (partner.role !== 'PARTNER' && partner.role !== 'ADMIN')) throw coded(403, 'only_partners_accept');
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) throw coded(404, 'booking_not_found');
  if (b.status !== 'REQUESTED') throw coded(409, 'booking_not_requested');
  return prisma.booking.update({
    where: { id: bookingId },
    data: { partnerId, status: 'ACCEPTED' },
    include: BOOKING_FULL,
  }) as Promise<FullBooking>;
}

export async function cancelBooking(bookingId: string, userId: string): Promise<FullBooking> {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) throw coded(404, 'booking_not_found');
  if (b.customerId !== userId) throw coded(403, 'only_customer_cancels');
  if (b.status !== 'REQUESTED') throw coded(409, 'only_requested_cancellable');
  return prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'CANCELLED' },
    include: BOOKING_FULL,
  }) as Promise<FullBooking>;
}

export async function completeBooking(bookingId: string, partnerId: string): Promise<FullBooking> {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) throw coded(404, 'booking_not_found');
  if (b.partnerId !== partnerId) throw coded(403, 'only_assigned_partner_completes');
  if (b.status !== 'ACCEPTED' && b.status !== 'ONGOING') throw coded(409, 'booking_not_completable');
  return prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'COMPLETED', paymentStatus: 'COMPLETED' },
    include: BOOKING_FULL,
  }) as Promise<FullBooking>;
}

// Mock customer payment (Stripe/Razorpay integration is post-MVP).
export async function payBooking(bookingId: string, userId: string): Promise<FullBooking> {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) throw coded(404, 'booking_not_found');
  if (b.customerId !== userId) throw coded(403, 'only_customer_pays');
  if (b.paymentStatus === 'COMPLETED') throw coded(409, 'already_paid');
  return prisma.booking.update({
    where: { id: bookingId },
    data: { paymentStatus: 'COMPLETED' },
    include: BOOKING_FULL,
  }) as Promise<FullBooking>;
}

export interface WalletSummary {
  currency: 'INR';
  asPartner: { earnedPaise: number; pendingPaise: number };
  asCustomer: { spentPaise: number };
  note: string;
}

export async function walletSummary(userId: string): Promise<WalletSummary> {
  const [earned, pending, spent] = await Promise.all([
    prisma.booking.aggregate({ where: { partnerId: userId, status: 'COMPLETED' }, _sum: { partnerPayoutPaise: true } }),
    prisma.booking.aggregate({ where: { partnerId: userId, status: { in: ['ACCEPTED', 'ONGOING'] } }, _sum: { partnerPayoutPaise: true } }),
    prisma.booking.aggregate({ where: { customerId: userId, status: 'COMPLETED' }, _sum: { amountPaise: true } }),
  ]);
  return {
    currency: 'INR',
    asPartner: { earnedPaise: earned._sum.partnerPayoutPaise || 0, pendingPaise: pending._sum.partnerPayoutPaise || 0 },
    asCustomer: { spentPaise: spent._sum.amountPaise || 0 },
    note: 'mock balances — immutable double-entry ledger is Phase B',
  };
}
