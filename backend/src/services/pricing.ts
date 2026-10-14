// Fare quotes + commission splits. Pure functions (no DB) so they
// are trivially unit-testable. All money in paise (Int).
export const DRIVER_RATE_PER_KM_PAISE = 800; // ₹8/KM legacy (kept for compat)
export const DRIVER_RATE_PER_HOUR_PAISE = 15000; // ₹150/hr fixed platform rate (timer model)
export const DEFAULT_COMMISSION_BPS = 2000; // 20% platform take (range 20-25%)
export const TIMER_MIN_BILL_MINUTES = 60; // first-hour minimum
export const OTP_TTL_MS = 10 * 60 * 1000; // OTPs valid 10 minutes

export interface FareSplit {
  amountPaise: number;
  commissionBps: number;
  platformFeePaise: number;
  partnerPayoutPaise: number;
}

export interface DriverQuote extends FareSplit {
  distanceKm: number;
  ratePerKmPaise: number;
}

export interface ParkingQuote extends FareSplit {
  pricePerHourPaise: number;
  hours: number;
}

export interface DriverHoursQuote extends FareSplit {
  hours: number;
  ratePerHourPaise: number;
}

function assertMoney(n: number, name: string): void {
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name}_must_be_non_negative_int`);
}

// amount * bps / 10000, rounded. fee + payout === amount always.
export function splitFare(amountPaise: number, commissionBps: number = DEFAULT_COMMISSION_BPS): FareSplit {
  assertMoney(amountPaise, 'amountPaise');
  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10000) {
    throw new Error('commissionBps_must_be_int_0_10000');
  }
  const platformFeePaise = Math.round((amountPaise * commissionBps) / 10000);
  const partnerPayoutPaise = amountPaise - platformFeePaise;
  return { amountPaise, commissionBps, platformFeePaise, partnerPayoutPaise };
}

export function quoteDriverFare(distanceKm: number, commissionBps: number = DEFAULT_COMMISSION_BPS): DriverQuote {
  if (!(distanceKm > 0)) throw new Error('distanceKm_must_be_positive');
  const amountPaise = Math.round(distanceKm * DRIVER_RATE_PER_KM_PAISE);
  return { distanceKm, ratePerKmPaise: DRIVER_RATE_PER_KM_PAISE, ...splitFare(amountPaise, commissionBps) };
}

// Timer model estimate: fixed platform ₹/hr × estimated hours.
export function quoteDriverHours(hours: number, commissionBps: number = DEFAULT_COMMISSION_BPS): DriverHoursQuote {
  if (!(hours > 0)) throw new Error('hours_must_be_positive');
  const amountPaise = Math.round(hours * DRIVER_RATE_PER_HOUR_PAISE);
  return { hours, ratePerHourPaise: DRIVER_RATE_PER_HOUR_PAISE, ...splitFare(amountPaise, commissionBps) };
}

// Final timer bill. Per-minute round-up with a first-hour minimum:
// billedMinutes = max(60, ceil(elapsedSec / 60)), then split as usual.
// Pure — mirrored in packages/types for client-side live estimates.
export function computeTimerBill(elapsedSec: number, ratePerHourPaise: number, commissionBps: number = DEFAULT_COMMISSION_BPS): FareSplit & { billedMinutes: number } {
  if (!(elapsedSec >= 0)) throw new Error('elapsedSec_must_be_non_negative');
  if (!Number.isInteger(ratePerHourPaise) || ratePerHourPaise <= 0) throw new Error('ratePerHourPaise_must_be_positive_int');
  const billedMinutes = Math.max(TIMER_MIN_BILL_MINUTES, Math.ceil(elapsedSec / 60));
  const amountPaise = Math.round((billedMinutes * ratePerHourPaise) / 60);
  return { billedMinutes, ...splitFare(amountPaise, commissionBps) };
}

export function makeOtp(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function quoteParkingFare(pricePerHourPaise: number, hours: number, commissionBps: number = DEFAULT_COMMISSION_BPS): ParkingQuote {
  assertMoney(pricePerHourPaise, 'pricePerHourPaise');
  if (!(hours > 0)) throw new Error('hours_must_be_positive');
  const amountPaise = Math.round(pricePerHourPaise * hours);
  return { pricePerHourPaise, hours, ...splitFare(amountPaise, commissionBps) };
}
