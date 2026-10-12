import type { Booking, DriverQuote, ParkingQuote, Wallet } from '../../types/src';
import { api } from './client';

export async function quoteDriver(distanceKm: number): Promise<{ quote: DriverQuote }> {
  const { data } = await api().get('/pricing/quote', { params: { type: 'driver', distanceKm } });
  return data;
}

export async function quoteParking(pricePerHourPaise: number, hours: number): Promise<{ quote: ParkingQuote }> {
  const { data } = await api().get('/pricing/quote', { params: { type: 'parking', pricePerHourPaise, hours } });
  return data;
}

export async function createBooking(input: Record<string, unknown>): Promise<{ booking: Booking; notified: string[] }> {
  const { data } = await api().post('/bookings', input);
  return data;
}

export async function listBookings(): Promise<{ bookings: Booking[] }> {
  const { data } = await api().get('/bookings');
  return data;
}

export async function cancelBooking(id: string): Promise<{ booking: Booking }> {
  const { data } = await api().patch(`/bookings/${id}/cancel`);
  return data;
}

export async function acceptBooking(id: string): Promise<{ booking: Booking }> {
  const { data } = await api().patch(`/bookings/${id}/accept`);
  return data;
}

export async function completeBooking(id: string): Promise<{ booking: Booking }> {
  const { data } = await api().patch(`/bookings/${id}/complete`);
  return data;
}

export async function wallet(): Promise<{ wallet: Wallet }> {
  const { data } = await api().get('/wallet');
  return data;
}
