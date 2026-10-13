import type { Request, Response } from 'express';

import { createVehicle, myVehicles, updateVehicle } from '../services/vehicles';

export async function create(req: Request, res: Response): Promise<void> {
  const { plateNumber, make, model, category } = (req.body || {}) as {
    plateNumber?: string;
    make?: string;
    model?: string;
    category?: string;
  };
  res.status(201).json({ vehicle: await createVehicle(req.user.id, { plateNumber: plateNumber as string, make, model, category }) });
}

export async function mine(req: Request, res: Response): Promise<void> {
  res.json({ vehicles: await myVehicles(req.user.id) });
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json({ vehicle: await updateVehicle(req.user.id, req.params.id, (req.body || {}) as { isActive?: boolean }) });
}
