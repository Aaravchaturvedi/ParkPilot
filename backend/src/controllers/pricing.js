const { quoteDriverFare, quoteParkingFare } = require('../services/pricing');

// Public: apps show prices before login.
async function quote(req, res) {
  const { type, distanceKm, pricePerHourPaise, hours, commissionBps } = req.query;
  const bps = commissionBps === undefined ? undefined : Number(commissionBps);
  try {
    if (type === 'driver') return res.json({ quote: quoteDriverFare(Number(distanceKm), bps) });
    if (type === 'parking') return res.json({ quote: quoteParkingFare(Number(pricePerHourPaise), Number(hours), bps) });
    return res.status(400).json({ error: 'type_must_be_driver_or_parking' });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}

module.exports = { quote };
