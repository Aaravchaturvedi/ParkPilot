import type { Request, Response } from 'express';

import { walletSummary } from '../services/bookings';

export async function get(req: Request, res: Response): Promise<void> {
  res.json({ wallet: await walletSummary(req.user.id) });
}
