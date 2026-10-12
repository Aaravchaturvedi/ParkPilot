const prisma = require('../lib/prisma');
const { acceptBooking } = require('../services/bookings');
const { nearbyDrivers, liveDriverIds } = require('./location');

const driverRoom = (id) => `driver:${id}`;
const userRoom = (id) => `user:${id}`;
const bookingRoom = (id) => `booking:${id}`;

// Called after REST booking create AND reusable by future channels.
async function dispatchNewBooking(io, booking) {
  if (!io) return [];
  if (booking.type === 'PARKING') {
    const space = await prisma.parkingSpace.findUnique({ where: { id: booking.spaceId } });
    if (!space) return [];
    io.to(userRoom(space.ownerId)).emit('booking:request', { booking });
    return [space.ownerId];
  }
  let ids;
  if (booking.pickupLat != null && booking.pickupLng != null) {
    ids = await nearbyDrivers(booking.pickupLng, booking.pickupLat, 5, 10);
  } else {
    ids = await liveDriverIds(10);
  }
  for (const id of ids) io.to(driverRoom(id)).emit('booking:request', { booking });
  return ids;
}

function registerDispatchHandlers(io, socket) {
  const { id, role } = socket.data.user;
  if (role !== 'PARTNER' && role !== 'ADMIN') return;

  socket.on('booking:accept', async ({ bookingId } = {}, ack) => {
    try {
      const booking = await acceptBooking(bookingId, id);
      io.to(bookingRoom(booking.id)).emit('booking:updated', { booking });
      io.to(userRoom(booking.customerId)).emit('booking:accepted', { booking });
      ack?.({ ok: true, booking });
    } catch (e) {
      ack?.({ ok: false, error: e.message });
    }
  });

  socket.on('booking:reject', async ({ bookingId } = {}, ack) => {
    try {
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (!booking) return ack?.({ ok: false, error: 'booking_not_found' });
      io.to(userRoom(booking.customerId)).emit('booking:rejected', { bookingId, by: id });
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'reject_failed' });
    }
  });
}

module.exports = { dispatchNewBooking, registerDispatchHandlers };
