import type { Request, Response } from 'express';

import { quoteDriverFare, quoteDriverHours, quoteParkingFare } from '../services/pricing';

// Public: apps show prices before login.
export async function quote(req: Request, res: Response): Promise<void> {
  const { type, distanceKm, pricePerHourPaise, hours, commissionBps } = req.query as {
    type?: string;
    distanceKm?: string;
    pricePerHourPaise?: string;
    hours?: string;
    commissionBps?: string;
  };
  const bps = commissionBps === undefined ? undefined : Number(commissionBps);
  try {
    if (type === 'driver') {
      res.json({ quote: quoteDriverFare(Number(distanceKm), bps) });
      return;
    }
    if (type === 'driver_hours') {
      res.json({ quote: quoteDriverHours(Number(hours), bps) });
      return;
    }
    if (type === 'parking') {
      res.json({ quote: quoteParkingFare(Number(pricePerHourPaise), Number(hours), bps) });
      return;
    }
    res.status(400).json({ error: 'type_must_be_driver_or_parking' });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
}
