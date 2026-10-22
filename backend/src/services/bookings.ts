import type { Booking, Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { coded } from '../middleware/async';
import { quoteDriverHours, quoteParkingFare, computeTimerBill, makeOtp, OTP_TTL_MS, DRIVER_RATE_PER_HOUR_PAISE, DEFAULT_COMMISSION_BPS } from './pricing';

const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  kycStatus: true,
  createdAt: true,
} as const;

export const BOOKING_FULL: Prisma.BookingInclude = {
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
  hours: number;
  pickupLat?: number;
  pickupLng?: number;
  commissionBps?: number;
}

export interface ParkingBookingInput {
  customerId: string;
  spaceId: string;
  hours: number;
  commissionBps?: number;
}

export async function createDriverBooking(input: DriverBookingInput): Promise<FullBooking> {
  const { customerId, hours, pickupLat, pickupLng, commissionBps } = input;
  if (!(hours > 0)) throw coded(400, 'hours_must_be_positive');
  // Fixed platform rate: the customer books estimated HOURS, never a distance.
  const q = quoteDriverHours(hours, bpsOrDefault(commissionBps));
  return prisma.booking.create({
    data: {
      type: 'DRIVER',
      status: 'REQUESTED',
      customerId,
      pickupLat: pickupLat ?? null,
      pickupLng: pickupLng ?? null,
      estimatedHours: hours,
      pricePerHourPaise: DRIVER_RATE_PER_HOUR_PAISE,
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
  if (b.customerId === userId || b.partnerId === userId) return b;
  // Hosts own their parking bookings via the space even before they accept
  // (partnerId is still null at REQUESTED). Without this the host can never
  // join/track their own incoming parking request.
  if (b.spaceId) {
    const space = await prisma.parkingSpace.findUnique({ where: { id: b.spaceId }, select: { ownerId: true } });
    if (space && space.ownerId === userId) return b;
  }
  throw coded(403, 'not_your_booking');
}

// Day 7 sockets reuse these transitions.
// Accept is atomic: UPDATE ... WHERE status='REQUESTED' so two partners
// racing the same request cannot both win — the loser gets 409.
export async function acceptBooking(bookingId: string, partnerId: string): Promise<FullBooking> {
  const partner = await prisma.user.findUnique({ where: { id: partnerId } });
  if (!partner || (partner.role !== 'PARTNER' && partner.role !== 'ADMIN')) throw coded(403, 'only_partners_accept');
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { space: { select: { ownerId: true } } } });
  if (!b) throw coded(404, 'booking_not_found');
  if (b.status !== 'REQUESTED') throw coded(409, 'booking_not_requested');

  // If this is a driver booking, ensure partner does not already have a ride in progress
  if (b.type === 'DRIVER') {
    const existingActive = await prisma.booking.findFirst({
      where: {
        partnerId,
        type: 'DRIVER',
        status: { in: ['ACCEPTED', 'ONGOING'] },
      },
    });
    if (existingActive) throw coded(409, 'partner_has_active_ride');
  }

  // Parking bookings belong to a space: only its owner (or admin) may accept.
  // Driver bookings are open to any partner (first-come, first-served).
  if (b.type === 'PARKING') {
    const ownerId = b.space?.ownerId;
    if (!ownerId) throw coded(404, 'space_not_found');
    if (ownerId !== partnerId && partner.role !== 'ADMIN') throw coded(403, 'only_space_owner_accepts');
  }
  const updated = await prisma.booking.updateMany({
    where: { id: bookingId, status: 'REQUESTED' },
    data: { partnerId, status: 'ACCEPTED' },
  });
  if (updated.count === 0) throw coded(409, 'booking_not_requested');
  return prisma.booking.findUnique({ where: { id: bookingId }, include: BOOKING_FULL }) as Promise<FullBooking>;
}

// ACCEPTED -> ONGOING: driver started the trip. Customer tracking UI moves
// from "driver arriving" to "on trip"; pay stays available.
// Timer-model OTP handshake (DRIVER bookings only).
// Start: partner taps "reached customer" -> server mints a start OTP shown
// IN THE CUSTOMER APP; customer reads it aloud; partner types it in ->
// timer starts (ACCEPTED -> ONGOING).
// Stop: customer taps "end trip" -> server mints a stop OTP shown IN THE
// PARTNER APP; partner reads it aloud; customer types it in -> bill computed
// from actual elapsed time (ONGOING -> COMPLETED).
export interface OtpIssued {
  booking: FullBooking;
  otp: string;
  expiresAt: Date;
}

function assertTimerBooking(b: { type: string } | null): void {
  if (!b) throw coded(404, 'booking_not_found');
  if (b.type !== 'DRIVER') throw coded(400, 'timer_only_for_driver');
}

export async function requestStartOtp(bookingId: string, partnerId: string): Promise<OtpIssued> {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  assertTimerBooking(b);
  if (b!.partnerId !== partnerId) throw coded(403, 'only_assigned_partner_starts');
  if (b!.status !== 'ACCEPTED') throw coded(409, 'booking_not_startable');
  const otp = makeOtp();
  const booking = (await prisma.booking.update({
    where: { id: bookingId },
    data: { startOtp: otp, startOtpExpiresAt: new Date(Date.now() + OTP_TTL_MS) },
    include: BOOKING_FULL,
  })) as FullBooking;
  return { booking, otp, expiresAt: booking.startOtpExpiresAt as Date };
}

export async function verifyStartOtp(bookingId: string, partnerId: string, otp: string): Promise<FullBooking> {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  assertTimerBooking(b);
  if (b!.partnerId !== partnerId) throw coded(403, 'only_assigned_partner_starts');
  if (b!.status !== 'ACCEPTED') throw coded(409, 'booking_not_startable');
  if (!b!.startOtp || !b!.startOtpExpiresAt || b!.startOtpExpiresAt.getTime() < Date.now() || b!.startOtp !== otp) {
    throw coded(400, 'invalid_or_expired_otp');
  }
  return prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'ONGOING', startedAt: new Date(), startOtp: null, startOtpExpiresAt: null },
    include: BOOKING_FULL,
  }) as Promise<FullBooking>;
}

export async function requestStopOtp(bookingId: string, customerId: string): Promise<OtpIssued> {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  assertTimerBooking(b);
  if (b!.customerId !== customerId) throw coded(403, 'only_customer_stops');
  if (b!.status !== 'ONGOING' || !b!.startedAt) throw coded(409, 'booking_not_stoppable');
  const otp = makeOtp();
  const booking = (await prisma.booking.update({
    where: { id: bookingId },
    data: { endOtp: otp, endOtpExpiresAt: new Date(Date.now() + OTP_TTL_MS) },
    include: BOOKING_FULL,
  })) as FullBooking;
  return { booking, otp, expiresAt: booking.endOtpExpiresAt as Date };
}

export async function verifyStopOtp(bookingId: string, customerId: string, otp: string): Promise<FullBooking> {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  assertTimerBooking(b);
  if (b!.customerId !== customerId) throw coded(403, 'only_customer_stops');
  if (b!.status !== 'ONGOING' || !b!.startedAt) throw coded(409, 'booking_not_stoppable');
  if (!b!.endOtp || !b!.endOtpExpiresAt || b!.endOtpExpiresAt.getTime() < Date.now() || b!.endOtp !== otp) {
    throw coded(400, 'invalid_or_expired_otp');
  }
  const endedAt = new Date();
  const elapsedSec = Math.max(0, Math.round((endedAt.getTime() - b!.startedAt.getTime()) / 1000));
  const rate = b!.pricePerHourPaise ?? DRIVER_RATE_PER_HOUR_PAISE;
  const bill = computeTimerBill(elapsedSec, rate, b!.commissionBps);
  return prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: 'COMPLETED',
      endedAt,
      endOtp: null,
      endOtpExpiresAt: null,
      billedMinutes: bill.billedMinutes,
      amountPaise: bill.amountPaise,
      platformFeePaise: bill.platformFeePaise,
      partnerPayoutPaise: bill.partnerPayoutPaise,
    },
    include: BOOKING_FULL,
  }) as Promise<FullBooking>;
}

export async function cancelBooking(bookingId: string, userId: string): Promise<FullBooking> {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) throw coded(404, 'booking_not_found');
  if (b.customerId !== userId) throw coded(403, 'only_customer_cancels');
  // Customer may cancel while waiting (REQUESTED) or after a driver accepted
  // but before completion. Terminal states stay immutable.
  if (b.status !== 'REQUESTED' && b.status !== 'ACCEPTED') throw coded(409, 'only_requested_or_accepted_cancellable');
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
    data: { status: 'COMPLETED' },
    include: BOOKING_FULL,
  }) as Promise<FullBooking>;
}

// Mock customer payment (Stripe/Razorpay integration is post-MVP).
export async function payBooking(bookingId: string, userId: string): Promise<FullBooking> {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) throw coded(404, 'booking_not_found');
  if (b.customerId !== userId) throw coded(403, 'only_customer_pays');
  if (b.paymentStatus === 'COMPLETED') throw coded(409, 'already_paid');
  // Pay only makes sense once a driver/host accepted (or the trip is
  // underway/done). Paying a lonely REQUESTED booking is a client bug.
  if (b.status !== 'ACCEPTED' && b.status !== 'ONGOING' && b.status !== 'COMPLETED') throw coded(409, 'booking_not_payable_yet');
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
    prisma.booking.aggregate({ where: { customerId: userId, status: 'COMPLETED', paymentStatus: 'COMPLETED' }, _sum: { amountPaise: true } }),
  ]);
  return {
    currency: 'INR',
    asPartner: { earnedPaise: earned._sum.partnerPayoutPaise || 0, pendingPaise: pending._sum.partnerPayoutPaise || 0 },
    asCustomer: { spentPaise: spent._sum.amountPaise || 0 },
    note: 'mock balances — immutable double-entry ledger is Phase B',
  };
}
