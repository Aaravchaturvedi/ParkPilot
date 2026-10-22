import type { Request, Response } from 'express';
import type { Server } from 'socket.io';
import * as svc from '../services/bookings';
import type { FullBooking } from '../services/bookings';
import prisma from '../lib/prisma';

import { emitBooking } from '../sockets';
import { dispatchNewBooking } from '../sockets/dispatch';
import { onlinePartnerIds } from '../sockets/location';

function ioOf(req: Request): Server | undefined {
  return req.app.get('io') as Server | undefined;
}

// OTPs gate a physical meeting: the start code is ONLY ever readable by the
// customer, the stop code ONLY by the partner. Every REST booking payload is
// scrubbed for the viewer, and socket booking payloads carry no OTPs at all
// (codes travel exclusively via booking:start-otp / booking:stop-otp to the
// intended recipient's rooms). Without this the partner could pull the start
// code from GET /bookings/:id without ever reaching the customer.
type SafeBooking = Omit<FullBooking, 'startOtp' | 'startOtpExpiresAt' | 'endOtp' | 'endOtpExpiresAt'> & {
  startOtp: string | null;
  startOtpExpiresAt: Date | null;
  endOtp: string | null;
  endOtpExpiresAt: Date | null;
};

function presentFor(viewerId: string, booking: FullBooking): SafeBooking {
  return {
    ...booking,
    startOtp: viewerId === booking.customerId ? booking.startOtp : null,
    startOtpExpiresAt: viewerId === booking.customerId ? booking.startOtpExpiresAt : null,
    endOtp: booking.partnerId !== null && viewerId === booking.partnerId ? booking.endOtp : null,
    endOtpExpiresAt: booking.partnerId !== null && viewerId === booking.partnerId ? booking.endOtpExpiresAt : null,
  };
}

export async function create(req: Request, res: Response): Promise<void> {
  // One email = one side: partners book through the partner role, not as customers.
  if (req.user.role !== 'CUSTOMER' && req.user.role !== 'ADMIN') {
    res.status(403).json({ error: 'only_customers_book' });
    return;
  }
  const { type, spaceId, hours, pickupLat, pickupLng, commissionBps } = (req.body || {}) as {
    type?: string;
    spaceId?: string;
    hours?: number;
    pickupLat?: number;
    pickupLng?: number;
    commissionBps?: number;
  };
  let booking;
  if (type === 'DRIVER') {
    booking = await svc.createDriverBooking({ customerId: req.user.id, hours: hours as number, pickupLat, pickupLng, commissionBps });
  } else if (type === 'PARKING') {
    booking = await svc.createParkingBooking({ customerId: req.user.id, spaceId: spaceId as string, hours: hours as number, commissionBps });
  } else {
    res.status(400).json({ error: 'type_must_be_DRIVER_or_PARKING' });
    return;
  }
  const notified = await dispatchNewBooking(ioOf(req), booking);
  res.status(201).json({ booking: presentFor(req.user.id, booking), notified });
}

export async function list(req: Request, res: Response): Promise<void> {
  const bookings = await svc.getOwnBookings(req.user.id);
  res.json({ bookings: bookings.map((b) => presentFor(req.user.id, b)) });
}

export async function get(req: Request, res: Response): Promise<void> {
  const booking = await svc.getBookingForParty(req.params.id, req.user.id);
  res.json({ booking: presentFor(req.user.id, booking) });
}

export async function accept(req: Request, res: Response): Promise<void> {
  const booking = await svc.acceptBooking(req.params.id, req.user.id);
  emitBooking(ioOf(req), booking);
  res.json({ booking: presentFor(req.user.id, booking) });
}

// Partner reached the customer: mint the start OTP. It is delivered to the
// CUSTOMER (in-app display via socket + readable via GET), never to the
// requester — the handshake only works if the two humans meet.
export async function requestStartOtp(req: Request, res: Response): Promise<void> {
  const { booking, otp, expiresAt } = await svc.requestStartOtp(req.params.id, req.user.id);
  const io = ioOf(req);
  emitBooking(io, booking);
  if (io) {
    // Customer's personal room ONLY — never the shared booking room (the
    // partner sits in it and must not see this code).
    io.to(`user:${booking.customerId}`).emit('booking:start-otp', { bookingId: booking.id, otp, expiresAt });
  }
  // Partner's REST response carries no code — the handshake only works if
  // the two humans actually meet.
  res.json({ booking: presentFor(req.user.id, booking), expiresAt });
}

export async function verifyStartOtp(req: Request, res: Response): Promise<void> {
  const { otp } = (req.body || {}) as { otp?: string };
  const booking = await svc.verifyStartOtp(req.params.id, req.user.id, String(otp ?? ''));
  emitBooking(ioOf(req), booking);
  res.json({ booking: presentFor(req.user.id, booking) });
}

// Customer ends the trip: mint the stop OTP for the PARTNER side.
export async function requestStopOtp(req: Request, res: Response): Promise<void> {
  const { booking, otp, expiresAt } = await svc.requestStopOtp(req.params.id, req.user.id);
  const io = ioOf(req);
  emitBooking(io, booking);
  if (io && booking.partnerId) {
    // Partner's personal room ONLY — never the shared booking room.
    io.to(`user:${booking.partnerId}`).emit('booking:stop-otp', { bookingId: booking.id, otp, expiresAt });
  }
  res.json({ booking: presentFor(req.user.id, booking), expiresAt });
}

export async function verifyStopOtp(req: Request, res: Response): Promise<void> {
  const { otp } = (req.body || {}) as { otp?: string };
  const booking = await svc.verifyStopOtp(req.params.id, req.user.id, String(otp ?? ''));
  emitBooking(ioOf(req), booking);
  res.json({ booking: presentFor(req.user.id, booking) });
}

export async function cancel(req: Request, res: Response): Promise<void> {
  const booking = await svc.cancelBooking(req.params.id, req.user.id);
  emitBooking(ioOf(req), booking);
  res.json({ booking: presentFor(req.user.id, booking) });
}

export async function complete(req: Request, res: Response): Promise<void> {
  const booking = await svc.completeBooking(req.params.id, req.user.id);
  emitBooking(ioOf(req), booking);
  res.json({ booking: presentFor(req.user.id, booking) });
}

export async function pay(req: Request, res: Response): Promise<void> {
  const booking = await svc.payBooking(req.params.id, req.user.id);
  emitBooking(ioOf(req), booking);
  res.json({ booking: presentFor(req.user.id, booking) });
}

export async function onlineDrivers(_req: Request, res: Response): Promise<void> {
  const ids = await onlinePartnerIds();
  res.json({ count: ids.length, driverIds: ids });
}

export async function checkOpenRequests(req: Request, res: Response): Promise<void> {
  const { ids } = (req.body || {}) as { ids?: string[] };

  // Partners with a ride in progress cannot view or receive new open requests
  if (req.user?.id) {
    const active = await prisma.booking.findFirst({
      where: {
        partnerId: req.user.id,
        type: 'DRIVER',
        status: { in: ['ACCEPTED', 'ONGOING'] },
      },
    });
    if (active) {
      res.json({ openBookings: [], statusMap: {} });
      return;
    }
  }

  const open = (await prisma.booking.findMany({
    where: {
      type: 'DRIVER',
      status: 'REQUESTED',
      partnerId: null,
    },
    orderBy: { createdAt: 'desc' },
    take: 25,
    include: svc.BOOKING_FULL,
  })) as FullBooking[];

  const statusMap: Record<string, string> = {};
  if (Array.isArray(ids) && ids.length > 0) {
    const checked = await prisma.booking.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true, partnerId: true },
    });
    for (const b of checked) {
      statusMap[b.id] = (b.partnerId && b.status === 'REQUESTED') ? 'ACCEPTED' : b.status;
    }
    for (const id of ids) {
      if (!statusMap[id]) {
        statusMap[id] = 'DELETED';
      }
    }
  }

  res.json({
    openBookings: open.map((b) => presentFor(req.user.id, b)),
    statusMap,
  });
}
