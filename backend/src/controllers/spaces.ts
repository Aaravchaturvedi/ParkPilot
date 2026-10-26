import type { Request, Response } from 'express';
import type { Server } from 'socket.io';
import { nearbySpaces, createSpace, mySpaces, updateSpace, deleteSpace } from '../services/spaces';

export async function nearby(req: Request, res: Response): Promise<void> {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radiusKm = req.query.radiusKm === undefined ? 5 : Number(req.query.radiusKm);
  res.json({ spaces: await nearbySpaces(lat, lng, radiusKm) });
}

export async function create(req: Request, res: Response): Promise<void> {
  const { title, address, lat, lng, pricePerHourPaise } = (req.body || {}) as {
    title?: string;
    address?: string;
    lat?: number;
    lng?: number;
    pricePerHourPaise?: number;
  };
  const space = await createSpace(req.user.id, {
    title: title as string,
    address: address as string,
    lat: lat as number,
    lng: lng as number,
    pricePerHourPaise: pricePerHourPaise as number,
  });
  const io = req.app.get('io') as Server | undefined;
  io?.emit('space:changed', { action: 'created', space });
  res.status(201).json({ space });
}

export async function mine(req: Request, res: Response): Promise<void> {
  res.json({ spaces: await mySpaces(req.user.id) });
}

export async function update(req: Request, res: Response): Promise<void> {
  const space = await updateSpace(
    req.user.id,
    req.params.id,
    (req.body || {}) as {
      title?: string;
      address?: string;
      pricePerHourPaise?: number;
      isActive?: boolean;
      lat?: number;
      lng?: number;
    }
  );
  const io = req.app.get('io') as Server | undefined;
  io?.emit('space:changed', { action: 'updated', space });
  res.json({ space });
}

export async function destroy(req: Request, res: Response): Promise<void> {
  const space = await deleteSpace(req.user.id, req.params.id);
  const io = req.app.get('io') as Server | undefined;
  io?.emit('space:changed', { action: 'deleted', space });
  res.json({ ok: true, space });
}
