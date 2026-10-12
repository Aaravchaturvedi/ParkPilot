// Day 3: fare quotes + commission splits. Pure functions (no DB) so they
// are trivially unit-testable. All money in paise (Int).
const DRIVER_RATE_PER_KM_PAISE = 800; // ₹8/KM (README pricing)
const DEFAULT_COMMISSION_BPS = 2000; // 20% platform take (range 20-25%)

function assertMoney(n, name) {
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name}_must_be_non_negative_int`);
}

// amount * bps / 10000, rounded. fee + payout === amount always.
function splitFare(amountPaise, commissionBps = DEFAULT_COMMISSION_BPS) {
  assertMoney(amountPaise, 'amountPaise');
  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10000) {
    throw new Error('commissionBps_must_be_int_0_10000');
  }
  const platformFeePaise = Math.round((amountPaise * commissionBps) / 10000);
  const partnerPayoutPaise = amountPaise - platformFeePaise;
  return { amountPaise, commissionBps, platformFeePaise, partnerPayoutPaise };
}

function quoteDriverFare(distanceKm, commissionBps = DEFAULT_COMMISSION_BPS) {
  if (!(distanceKm > 0)) throw new Error('distanceKm_must_be_positive');
  const amountPaise = Math.round(distanceKm * DRIVER_RATE_PER_KM_PAISE);
  return { distanceKm, ratePerKmPaise: DRIVER_RATE_PER_KM_PAISE, ...splitFare(amountPaise, commissionBps) };
}

function quoteParkingFare(pricePerHourPaise, hours, commissionBps = DEFAULT_COMMISSION_BPS) {
  assertMoney(pricePerHourPaise, 'pricePerHourPaise');
  if (!(hours > 0)) throw new Error('hours_must_be_positive');
  const amountPaise = Math.round(pricePerHourPaise * hours);
  return { pricePerHourPaise, hours, ...splitFare(amountPaise, commissionBps) };
}

module.exports = { DRIVER_RATE_PER_KM_PAISE, DEFAULT_COMMISSION_BPS, splitFare, quoteDriverFare, quoteParkingFare };
