const { nearbySpaces, createSpace, mySpaces, updateSpace } = require('../services/spaces');

async function nearby(req, res) {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radiusKm = req.query.radiusKm === undefined ? 5 : Number(req.query.radiusKm);
  return res.json({ spaces: await nearbySpaces(lat, lng, radiusKm) });
}

async function create(req, res) {
  const { title, address, lat, lng, pricePerHourPaise } = req.body || {};
  return res.status(201).json({ space: await createSpace(req.user.id, { title, address, lat, lng, pricePerHourPaise }) });
}

async function mine(req, res) {
  return res.json({ spaces: await mySpaces(req.user.id) });
}

async function update(req, res) {
  return res.json({ space: await updateSpace(req.user.id, req.params.id, req.body || {}) });
}

module.exports = { nearby, create, mine, update };
