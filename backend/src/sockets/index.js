const { Server } = require('socket.io');
const { verify } = require('../lib/tokens');

const userRoom = (id) => `user:${id}`;
const driverRoom = (id) => `driver:${id}`;
const bookingRoom = (id) => `booking:${id}`;

// Day 5: connection auth + rooms. Location/dispatch events: Day 6/7.
function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] }, // MVP-open; lock down post-MVP
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('missing_token'));
    try {
      const payload = verify(token, 'access');
      socket.data.user = { id: payload.sub, role: payload.role };
      return next();
    } catch {
      return next(new Error('invalid_token'));
    }
  });

  io.on('connection', (socket) => {
    const { id, role } = socket.data.user;
    socket.join(userRoom(id));
    if (role === 'PARTNER' || role === 'ADMIN') socket.join(driverRoom(id));

    socket.emit('connected', { userId: id, rooms: [userRoom(id), ...(role === 'PARTNER' || role === 'ADMIN' ? [driverRoom(id)] : [])] });

    socket.on('booking:join', async ({ bookingId }, ack) => {
      try {
        const { getBookingForParty } = require('../services/bookings');
        const booking = await getBookingForParty(bookingId, id);
        socket.join(bookingRoom(booking.id));
        ack?.({ ok: true, room: bookingRoom(booking.id), status: booking.status });
      } catch (e) {
        ack?.({ ok: false, error: e.message });
      }
    });

    socket.on('booking:leave', ({ bookingId }, ack) => {
      socket.leave(bookingRoom(bookingId));
      ack?.({ ok: true });
    });

    require('./location').registerLocationHandlers(io, socket);
  });

  return io;
}

function emitBooking(io, booking) {
  io?.to(bookingRoom(booking.id)).emit('booking:updated', { booking });
}

module.exports = { initSockets, emitBooking, userRoom, driverRoom, bookingRoom };
