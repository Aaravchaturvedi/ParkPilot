import type { Booking, DriverQuote, DriverHoursQuote, ParkingQuote, Wallet } from '../../types/src';
import { api } from './client';

export async function quoteDriver(distanceKm: number): Promise<{ quote: DriverQuote }> {
  const { data } = await api().get('/pricing/quote', { params: { type: 'driver', distanceKm } });
  return data;
}

export async function quoteDriverHours(hours: number): Promise<{ quote: DriverHoursQuote }> {
  const { data } = await api().get('/pricing/quote', { params: { type: 'driver_hours', hours } });
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

// Timer-model OTP handshake. Start code is requested by the partner but
// readable only by the customer; stop code requested by the customer,
// readable only by the partner.
export async function requestStartOtp(id: string): Promise<{ booking: Booking; expiresAt: string }> {
  const { data } = await api().post(`/bookings/${id}/start-otp`);
  return data;
}

export async function verifyStartOtp(id: string, otp: string): Promise<{ booking: Booking }> {
  const { data } = await api().post(`/bookings/${id}/start-verify`, { otp });
  return data;
}

export async function requestStopOtp(id: string): Promise<{ booking: Booking; expiresAt: string }> {
  const { data } = await api().post(`/bookings/${id}/stop-otp`);
  return data;
}

export async function verifyStopOtp(id: string, otp: string): Promise<{ booking: Booking }> {
  const { data } = await api().post(`/bookings/${id}/stop-verify`, { otp });
  return data;
}

export async function completeBooking(id: string): Promise<{ booking: Booking }> {
  const { data } = await api().patch(`/bookings/${id}/complete`);
  return data;
}

export async function payBooking(id: string): Promise<{ booking: Booking }> {
  const { data } = await api().patch(`/bookings/${id}/pay`);
  return data;
}

export async function wallet(): Promise<{ wallet: Wallet }> {
  const { data } = await api().get('/wallet');
  return data;
}

export async function getOnlineDrivers(): Promise<{ count: number; driverIds: string[] }> {
  const { data } = await api().get('/bookings/drivers/online');
  return data;
}

export async function checkOpenRequests(ids: string[] = []): Promise<{
  openBookings: Booking[];
  statusMap: Record<string, string>;
}> {
  const { data } = await api().post('/bookings/requests/check', { ids });
  return data;
}
