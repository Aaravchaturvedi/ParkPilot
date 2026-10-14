import type { Server, Socket } from 'socket.io';
import prisma from '../lib/prisma';
import { acceptBooking, type FullBooking } from '../services/bookings';
import { nearbyDrivers, liveDriverIds, onlinePartnerIds } from './location';

const driverRoom = (id: string): string => `driver:${id}`;
const userRoom = (id: string): string => `user:${id}`;
const bookingRoom = (id: string): string => `booking:${id}`;

type Ack = (res: { ok: boolean; error?: string; booking?: FullBooking }) => void;

// Called after REST booking create AND reusable by future channels.
export async function dispatchNewBooking(io: Server | undefined, booking: FullBooking): Promise<string[]> {
  if (!io) return [];
  if (booking.type === 'PARKING') {
    if (!booking.spaceId) return [];
    const space = await prisma.parkingSpace.findUnique({ where: { id: booking.spaceId } });
    if (!space) return [];
    io.to(userRoom(space.ownerId)).emit('booking:request', { booking });
    return [space.ownerId];
  }
  let ids: string[];
  if (booking.pickupLat != null && booking.pickupLng != null) {
    // Prefer fresh GPS nearby; fall back to toggled-online partners
    // (drivers broadcast GPS only after accepting a ride).
    ids = await nearbyDrivers(booking.pickupLng, booking.pickupLat, 5, 10);
    if (ids.length === 0) ids = (await onlinePartnerIds()).slice(0, 10);
  } else {
    ids = (await onlinePartnerIds()).slice(0, 10);
    if (ids.length === 0) ids = await liveDriverIds(10);
  }
  for (const id of ids) io.to(driverRoom(id)).emit('booking:request', { booking });
  return ids;
}

export function registerDispatchHandlers(io: Server, socket: Socket): void {
  const { id, role } = socket.data.user as { id: string; role: string };
  if (role !== 'PARTNER' && role !== 'ADMIN') return;

  // Shared fan-out: booking room (explicit joiners) + both personal rooms.
  // Personal fallback covers slow mobile joins that land after the update.
  // OTP fields scrubbed — codes travel only via the dedicated OTP events.
  const fanOutUpdated = (booking: FullBooking): void => {
    const { startOtp: _s, startOtpExpiresAt: _se, endOtp: _e, endOtpExpiresAt: _ee, ...safe } = booking;
    const payload = { booking: safe };
    io.to(bookingRoom(booking.id)).emit('booking:updated', payload);
    io.to(userRoom(booking.customerId)).emit('booking:updated', payload);
    if (booking.partnerId) io.to(userRoom(booking.partnerId)).emit('booking:updated', payload);
  };

  socket.on('booking:accept', async ({ bookingId }: { bookingId?: string } = {}, ack?: Ack) => {
    try {
      if (!bookingId) {
        ack?.({ ok: false, error: 'bookingId_required' });
        return;
      }
      const booking = await acceptBooking(bookingId, id);
      // Winner joins the room so ONGOING/COMPLETED updates reach them even
      // if their REST join raced the accept.
      await socket.join(bookingRoom(booking.id));
      fanOutUpdated(booking);
      // Legacy event kept for dispatch-test + older customers.
      io.to(userRoom(booking.customerId)).emit('booking:accepted', { booking });
      ack?.({ ok: true, booking });
    } catch (e) {
      ack?.({ ok: false, error: (e as Error).message });
    }
  });

  socket.on('booking:start', async ({ bookingId }: { bookingId?: string } = {}, ack?: Ack) => {
    // Timer model enforces the OTP handshake: there is no socket shortcut to
    // ONGOING. Partners verify via POST /bookings/:id/start-verify.
    ack?.({ ok: false, error: 'use_start_verify_otp' });
  });

  socket.on('booking:reject', async ({ bookingId }: { bookingId?: string } = {}, ack?: Ack) => {
    try {
      const booking = await prisma.booking.findUnique({ where: { id: bookingId as string } });
      if (!booking) {
        ack?.({ ok: false, error: 'booking_not_found' });
        return;
      }
      // Reject is per-partner dismissal: global status stays REQUESTED so the
      // remaining online partners can still accept. The rejecting client
      // filters this id locally (see RequestsScreen dismissed set).
      io.to(userRoom(booking.customerId)).emit('booking:rejected', { bookingId, by: id });
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'reject_failed' });
    }
  });
}
