// Shared domain types. Mirror of backend Prisma enums + REST DTOs.
// Mobile apps and backend-adjacent code import from here; keep in sync
// with backend/prisma/schema.prisma (source of truth for the DB).

export type Role = 'CUSTOMER' | 'PARTNER' | 'ADMIN';
export type KycStatus = 'PENDING' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED';
export type VehicleCategory = 'HATCHBACK' | 'SEDAN' | 'SUV';
export type BookingType = 'DRIVER' | 'PARKING';
export type BookingStatus =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'ONGOING'
  | 'COMPLETED'
  | 'CANCELLED';
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  kycStatus: KycStatus;
  createdAt: string;
}

export interface Vehicle {
  id: string;
  plateNumber: string;
  make: string | null;
  model: string | null;
  category: VehicleCategory;
  isActive: boolean;
}

export interface ParkingSpace {
  id: string;
  title: string;
  address: string;
  lat: number;
  lng: number;
  pricePerHourPaise: number;
  isActive: boolean;
}

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

export interface DriverHoursQuote extends FareSplit {
  hours: number;
  ratePerHourPaise: number;
}

export interface ParkingQuote extends FareSplit {
  pricePerHourPaise: number;
  hours: number;
}

export interface Booking {
  id: string;
  type: BookingType;
  status: BookingStatus;
  customerId: string;
  partnerId: string | null;
  vehicleId: string | null;
  spaceId: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropLat: number | null;
  dropLng: number | null;
  distanceKm: number | null;
  // Timer model (DRIVER): estimate at booking, actuals at stop.
  estimatedHours: number | null;
  pricePerHourPaise: number | null;
  // OTP codes are recipient-scoped: startOtp is only ever populated for the
  // customer, endOtp only for the partner. Everyone else reads null.
  startOtp: string | null;
  startOtpExpiresAt: string | null;
  startedAt: string | null;
  endOtp: string | null;
  endOtpExpiresAt: string | null;
  endedAt: string | null;
  billedMinutes: number | null;
  amountPaise: number;
  commissionBps: number;
  platformFeePaise: number;
  partnerPayoutPaise: number;
  paymentStatus: PaymentStatus;
  vehicle?: Vehicle | null;
  space?: ParkingSpace | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
}

export interface Wallet {
  currency: 'INR';
  asPartner: { earnedPaise: number; pendingPaise: number };
  asCustomer: { spentPaise: number };
}

export interface LatLng {
  lat: number;
  lng: number;
}

export const paiseToRupees = (paise: number): string => `₹${(paise / 100).toFixed(2)}`;

export const TERMINAL_STATUSES: BookingStatus[] = ['COMPLETED', 'CANCELLED'];
export const isTerminalStatus = (s: BookingStatus): boolean => TERMINAL_STATUSES.includes(s);

// Haversine great-circle distance in km. Shared by customer (trip-length
// estimate, space distances) and partner (request proximity sort/filter) so
// both apps rank "nearest first" with identical math.
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLa = ((bLat - aLat) * Math.PI) / 180;
  const dLn = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLa / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function formatKm(km: number): string {
  return km < 10 ? `${Math.round(km * 10) / 10} km` : `${Math.round(km)} km`;
}

// Timer billing mirror of backend computeTimerBill: per-minute round-up with
// a first-hour minimum. Clients use it for LIVE running-cost display only —
// the server recomputes the final bill at stop-verify (source of truth).
export const TIMER_MIN_BILL_MINUTES = 60;

export function billedMinutesFor(elapsedSec: number): number {
  return Math.max(TIMER_MIN_BILL_MINUTES, Math.ceil(Math.max(0, elapsedSec) / 60));
}

export function runningCostPaise(elapsedSec: number, ratePerHourPaise: number): { billedMinutes: number; amountPaise: number } {
  const billedMinutes = billedMinutesFor(elapsedSec);
  return { billedMinutes, amountPaise: Math.round((billedMinutes * ratePerHourPaise) / 60) };
}

export function formatElapsed(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export interface TripSummary {
  total: number;
  active: number;
  completed: number;
  asCustomerSpentPaise: number;
  asPartnerEarnedPaise: number;
  asPartnerPendingPaise: number;
}

// Profile-screen rollup over the viewer's own ledger (mirrors the wallet
// query so profile earnings always agree with the Wallet tab).
export function summarizeBookings(bookings: Booking[], userId: string): TripSummary {
  let active = 0;
  let completed = 0;
  let asCustomerSpentPaise = 0;
  let asPartnerEarnedPaise = 0;
  let asPartnerPendingPaise = 0;
  for (const b of bookings) {
    if (b.status === 'REQUESTED' || b.status === 'ACCEPTED' || b.status === 'ONGOING') active += 1;
    if (b.status === 'COMPLETED') completed += 1;
    if (b.customerId === userId && b.status === 'COMPLETED' && b.paymentStatus === 'COMPLETED') {
      asCustomerSpentPaise += b.amountPaise;
    }
    if (b.partnerId === userId && b.status === 'COMPLETED') asPartnerEarnedPaise += b.partnerPayoutPaise;
    if (b.partnerId === userId && (b.status === 'ACCEPTED' || b.status === 'ONGOING')) {
      asPartnerPendingPaise += b.partnerPayoutPaise;
    }
  }
  return { total: bookings.length, active, completed, asCustomerSpentPaise, asPartnerEarnedPaise, asPartnerPendingPaise };
}
