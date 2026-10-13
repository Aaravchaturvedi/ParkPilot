import type { Request, Response } from 'express';
import type { Server } from 'socket.io';
import * as svc from '../services/bookings';

import { emitBooking } from '../sockets';
import { dispatchNewBooking } from '../sockets/dispatch';

function ioOf(req: Request): Server | undefined {
  return req.app.get('io') as Server | undefined;
}

export async function create(req: Request, res: Response): Promise<void> {
  const { type, distanceKm, vehicleId, spaceId, hours, pickupLat, pickupLng, dropLat, dropLng, commissionBps } = (req.body || {}) as {
    type?: string;
    distanceKm?: number;
    vehicleId?: string;
    spaceId?: string;
    hours?: number;
    pickupLat?: number;
    pickupLng?: number;
    dropLat?: number;
    dropLng?: number;
    commissionBps?: number;
  };
  let booking;
  if (type === 'DRIVER') {
    booking = await svc.createDriverBooking({ customerId: req.user.id, distanceKm: distanceKm as number, vehicleId, pickupLat, pickupLng, dropLat, dropLng, commissionBps });
  } else if (type === 'PARKING') {
    booking = await svc.createParkingBooking({ customerId: req.user.id, spaceId: spaceId as string, hours: hours as number, commissionBps });
  } else {
    res.status(400).json({ error: 'type_must_be_DRIVER_or_PARKING' });
    return;
  }
  const notified = await dispatchNewBooking(ioOf(req), booking);
  res.status(201).json({ booking, notified });
}

export async function list(req: Request, res: Response): Promise<void> {
  res.json({ bookings: await svc.getOwnBookings(req.user.id) });
}

export async function get(req: Request, res: Response): Promise<void> {
  res.json({ booking: await svc.getBookingForParty(req.params.id, req.user.id) });
}

export async function accept(req: Request, res: Response): Promise<void> {
  const booking = await svc.acceptBooking(req.params.id, req.user.id);
  emitBooking(ioOf(req), booking);
  res.json({ booking });
}

export async function cancel(req: Request, res: Response): Promise<void> {
  const booking = await svc.cancelBooking(req.params.id, req.user.id);
  emitBooking(ioOf(req), booking);
  res.json({ booking });
}

export async function complete(req: Request, res: Response): Promise<void> {
  const booking = await svc.completeBooking(req.params.id, req.user.id);
  emitBooking(ioOf(req), booking);
  res.json({ booking });
}

export async function pay(req: Request, res: Response): Promise<void> {
  const booking = await svc.payBooking(req.params.id, req.user.id);
  emitBooking(ioOf(req), booking);
  res.json({ booking });
}
