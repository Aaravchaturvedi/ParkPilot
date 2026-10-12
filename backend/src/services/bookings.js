const prisma = require('../lib/prisma');
const { coded } = require('../middleware/async');
const { quoteDriverFare, quoteParkingFare, DEFAULT_COMMISSION_BPS } = require('./pricing');

const BOOKING_FULL = { customer: true, partner: true, vehicle: true, space: true };
const MIN_BPS = 2000; // 20%
const MAX_BPS = 2500; // 25%

function bpsOrDefault(bps) {
  if (bps === undefined) return DEFAULT_COMMISSION_BPS;
  if (!Number.isInteger(bps) || bps < MIN_BPS || bps > MAX_BPS) throw coded(400, 'commissionBps_out_of_range_2000_2500');
  return bps;
}

async function createDriverBooking({ customerId, distanceKm, vehicleId, pickupLat, pickupLng, dropLat, dropLng, commissionBps }) {
  if (!(distanceKm > 0)) throw coded(400, 'distanceKm_must_be_positive');
  let vehicle = null;
  if (vehicleId) {
    vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle || !vehicle.isActive) throw coded(404, 'vehicle_not_available');
  }
  const q = quoteDriverFare(distanceKm, bpsOrDefault(commissionBps));
  return prisma.booking.create({
    data: {
      type: 'DRIVER', status: 'REQUESTED', customerId,
      vehicleId: vehicle ? vehicle.id : null,
      pickupLat: pickupLat ?? null, pickupLng: pickupLng ?? null,
      dropLat: dropLat ?? null, dropLng: dropLng ?? null,
      distanceKm, amountPaise: q.amountPaise, commissionBps: q.commissionBps,
      platformFeePaise: q.platformFeePaise, partnerPayoutPaise: q.partnerPayoutPaise,
    },
    include: BOOKING_FULL,
  });
}

async function createParkingBooking({ customerId, spaceId, hours, commissionBps }) {
  if (!spaceId) throw coded(400, 'spaceId_required');
  if (!(hours > 0)) throw coded(400, 'hours_must_be_positive');
  const space = await prisma.parkingSpace.findUnique({ where: { id: spaceId } });
  if (!space || !space.isActive) throw coded(404, 'space_not_available');
  const q = quoteParkingFare(space.pricePerHourPaise, hours, bpsOrDefault(commissionBps));
  return prisma.booking.create({
    data: {
      type: 'PARKING', status: 'REQUESTED', customerId, spaceId: space.id,
      amountPaise: q.amountPaise, commissionBps: q.commissionBps,
      platformFeePaise: q.platformFeePaise, partnerPayoutPaise: q.partnerPayoutPaise,
    },
    include: BOOKING_FULL,
  });
}

async function getOwnBookings(userId) {
  return prisma.booking.findMany({
    where: { OR: [{ customerId: userId }, { partnerId: userId }] },
    orderBy: { createdAt: 'desc' },
    include: BOOKING_FULL,
  });
}

async function getBookingForParty(bookingId, userId) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: BOOKING_FULL });
  if (!b) throw coded(404, 'booking_not_found');
  if (b.customerId !== userId && b.partnerId !== userId) throw coded(403, 'not_your_booking');
  return b;
}

// Day 7 sockets reuse these transitions.
async function acceptBooking(bookingId, partnerId) {
  const partner = await prisma.user.findUnique({ where: { id: partnerId } });
  if (!partner || (partner.role !== 'PARTNER' && partner.role !== 'ADMIN')) throw coded(403, 'only_partners_accept');
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) throw coded(404, 'booking_not_found');
  if (b.status !== 'REQUESTED') throw coded(409, 'booking_not_requested');
  return prisma.booking.update({ where: { id: bookingId }, data: { partnerId, status: 'ACCEPTED' }, include: BOOKING_FULL });
}

async function cancelBooking(bookingId, userId) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) throw coded(404, 'booking_not_found');
  if (b.customerId !== userId) throw coded(403, 'only_customer_cancels');
  if (b.status !== 'REQUESTED') throw coded(409, 'only_requested_cancellable');
  return prisma.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' }, include: BOOKING_FULL });
}

async function completeBooking(bookingId, partnerId) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) throw coded(404, 'booking_not_found');
  if (b.partnerId !== partnerId) throw coded(403, 'only_assigned_partner_completes');
  if (b.status !== 'ACCEPTED' && b.status !== 'ONGOING') throw coded(409, 'booking_not_completable');
  return prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'COMPLETED', paymentStatus: 'COMPLETED' },
    include: BOOKING_FULL,
  });
}

async function walletSummary(userId) {
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

module.exports = { createDriverBooking, createParkingBooking, getOwnBookings, getBookingForParty, acceptBooking, cancelBooking, completeBooking, walletSummary };
