// Fare quotes + commission splits. Pure functions (no DB) so they
// are trivially unit-testable. All money in paise (Int).
export const DRIVER_RATE_PER_KM_PAISE = 800; // ₹8/KM (README pricing)
export const DEFAULT_COMMISSION_BPS = 2000; // 20% platform take (range 20-25%)

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

export function quoteParkingFare(pricePerHourPaise: number, hours: number, commissionBps: number = DEFAULT_COMMISSION_BPS): ParkingQuote {
  assertMoney(pricePerHourPaise, 'pricePerHourPaise');
  if (!(hours > 0)) throw new Error('hours_must_be_positive');
  const amountPaise = Math.round(pricePerHourPaise * hours);
  return { pricePerHourPaise, hours, ...splitFare(amountPaise, commissionBps) };
}
