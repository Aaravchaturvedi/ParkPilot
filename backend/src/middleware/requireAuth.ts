import type { Request, Response, NextFunction } from 'express';
import { verify } from '../lib/tokens';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'missing_token' });
    return;
  }
  try {
    const payload = verify(token, 'access');
    if (payload.type !== 'access') throw new Error('wrong token type');
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

export default requireAuth;
