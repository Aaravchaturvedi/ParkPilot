import { Server, Socket } from 'socket.io';
import { verify } from '../lib/tokens';
import type { FullBooking } from '../services/bookings';
import { getBookingForParty } from '../services/bookings';
import { registerLocationHandlers } from './location';
import { registerDispatchHandlers } from './dispatch';

export const userRoom = (id: string): string => `user:${id}`;
export const driverRoom = (id: string): string => `driver:${id}`;
export const bookingRoom = (id: string): string => `booking:${id}`;

interface JoinPayload {
  bookingId: string;
}

interface JoinOk {
  ok: true;
  room: string;
  status: string;
}

interface JoinErr {
  ok: false;
  error: string;
}

type JoinAck = (res: JoinOk | JoinErr) => void;
type LeaveAck = (res: { ok: boolean }) => void;

// Day 5: connection auth + rooms. Location/dispatch events: Day 6/7.
export function initSockets(httpServer: import('http').Server): Server {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] }, // MVP-open; lock down post-MVP
  });

  io.use((socket, next) => {
    const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
    if (!token) return next(new Error('missing_token'));
    try {
      const payload = verify(token, 'access');
      if (payload.type !== 'access') throw new Error('wrong token type');
      socket.data.user = { id: payload.sub, role: payload.role };
      return next();
    } catch {
      return next(new Error('invalid_token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const { id, role } = socket.data.user as { id: string; role: string };
    void socket.join(userRoom(id));
    if (role === 'PARTNER' || role === 'ADMIN') void socket.join(driverRoom(id));

    socket.emit('connected', { userId: id, rooms: [userRoom(id), ...(role === 'PARTNER' || role === 'ADMIN' ? [driverRoom(id)] : [])] });

    socket.on('booking:join', async ({ bookingId }: JoinPayload, ack?: JoinAck) => {
      try {
        const booking = await getBookingForParty(bookingId, id);
        await socket.join(bookingRoom(booking.id));
        ack?.({ ok: true, room: bookingRoom(booking.id), status: booking.status });
      } catch (e) {
        ack?.({ ok: false, error: (e as Error).message });
      }
    });

    socket.on('booking:leave', ({ bookingId }: JoinPayload, ack?: LeaveAck) => {
      void socket.leave(bookingRoom(bookingId));
      ack?.({ ok: true });
    });

    registerLocationHandlers(io, socket);
    registerDispatchHandlers(io, socket);
  });

  return io;
}

export function emitBooking(io: Server | undefined, booking: FullBooking): void {
  if (!io) return;
  // Booking room (explicit join) AND personal rooms (joined at connect).
  // Personal fallback covers slow/flaky clients whose join lands after
  // the status change — the normal case on mobile networks.
  const payload = { booking };
  io.to(bookingRoom(booking.id)).emit('booking:updated', payload);
  io.to(userRoom(booking.customerId)).emit('booking:updated', payload);
  if (booking.partnerId) io.to(userRoom(booking.partnerId)).emit('booking:updated', payload);
}
