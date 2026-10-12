const { createVehicle, myVehicles, updateVehicle } = require('../services/vehicles');

async function create(req, res) {
  const { plateNumber, make, model, category } = req.body || {};
  return res.status(201).json({ vehicle: await createVehicle(req.user.id, { plateNumber, make, model, category }) });
}

async function mine(req, res) {
  return res.json({ vehicles: await myVehicles(req.user.id) });
}

async function update(req, res) {
  return res.json({ vehicle: await updateVehicle(req.user.id, req.params.id, req.body || {}) });
}

module.exports = { create, mine, update };
