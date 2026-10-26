import type { ParkingSpace } from '../../types/src';
import { api } from './client';

export async function mySpaces(): Promise<{ spaces: ParkingSpace[] }> {
  const { data } = await api().get('/spaces/mine');
  return data;
}

export async function createSpace(input: { title: string; address: string; lat: number; lng: number; pricePerHourPaise: number }): Promise<{ space: ParkingSpace }> {
  const { data } = await api().post('/spaces', input);
  return data;
}

export async function updateSpace(id: string, patch: { isActive?: boolean; pricePerHourPaise?: number; lat?: number; lng?: number }): Promise<{ space: ParkingSpace }> {
  const { data } = await api().patch(`/spaces/${id}`, patch);
  return data;
}

export async function deleteSpace(id: string): Promise<{ ok: boolean; space: ParkingSpace }> {
  const { data } = await api().delete(`/spaces/${id}`);
  return data;
}
