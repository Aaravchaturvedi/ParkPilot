const { walletSummary } = require('../services/bookings');

async function get(req, res) {
  return res.json({ wallet: await walletSummary(req.user.id) });
}

module.exports = { get };
