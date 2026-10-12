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
  distanceKm: number | null;
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
