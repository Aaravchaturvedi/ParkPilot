const svc = require('../services/bookings');

async function create(req, res) {
  const { type, distanceKm, vehicleId, spaceId, hours, pickupLat, pickupLng, dropLat, dropLng, commissionBps } = req.body || {};
  let booking;
  if (type === 'DRIVER') {
    booking = await svc.createDriverBooking({ customerId: req.user.id, distanceKm, vehicleId, pickupLat, pickupLng, dropLat, dropLng, commissionBps });
  } else if (type === 'PARKING') {
    booking = await svc.createParkingBooking({ customerId: req.user.id, spaceId, hours, commissionBps });
  } else {
    return res.status(400).json({ error: 'type_must_be_DRIVER_or_PARKING' });
  }
  return res.status(201).json({ booking });
}

async function list(req, res) {
  return res.json({ bookings: await svc.getOwnBookings(req.user.id) });
}

async function get(req, res) {
  return res.json({ booking: await svc.getBookingForParty(req.params.id, req.user.id) });
}

async function accept(req, res) {
  return res.json({ booking: await svc.acceptBooking(req.params.id, req.user.id) });
}

async function cancel(req, res) {
  return res.json({ booking: await svc.cancelBooking(req.params.id, req.user.id) });
}

async function complete(req, res) {
  return res.json({ booking: await svc.completeBooking(req.params.id, req.user.id) });
}

module.exports = { create, list, get, accept, cancel, complete };
