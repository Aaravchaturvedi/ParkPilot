const { nearbySpaces } = require('../services/spaces');

async function nearby(req, res) {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radiusKm = req.query.radiusKm === undefined ? 5 : Number(req.query.radiusKm);
  return res.json({ spaces: await nearbySpaces(lat, lng, radiusKm) });
}

module.exports = { nearby };
