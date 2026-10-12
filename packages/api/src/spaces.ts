import type { ParkingSpace } from '../../types/src';
import { api } from './client';

export async function nearbySpaces(lat: number, lng: number, radiusKm = 5): Promise<{ spaces: Array<ParkingSpace & { distanceKm: number }> }> {
  const { data } = await api().get('/spaces/nearby', { params: { lat, lng, radiusKm } });
  return data;
}
