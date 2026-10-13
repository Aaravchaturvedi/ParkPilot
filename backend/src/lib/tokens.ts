import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'dev_only_change_me';
if (!process.env.JWT_SECRET) console.warn('[auth] JWT_SECRET missing, using dev fallback');

export type TokenType = 'access' | 'refresh';

export interface AccessPayload {
  sub: string;
  role: string;
  type: 'access';
}

export interface RefreshPayload {
  sub: string;
  type: 'refresh';
}

interface TokenUser {
  id: string;
  role: string;
}

export function signAccess(user: TokenUser): string {
  return jwt.sign({ sub: user.id, role: user.role, type: 'access' }, SECRET, { expiresIn: '15m' });
}

export function signRefresh(user: Pick<TokenUser, 'id'>): string {
  return jwt.sign({ sub: user.id, type: 'refresh' }, SECRET, { expiresIn: '7d' });
}

export function verify(token: string, expectedType?: TokenType): AccessPayload | RefreshPayload {
  const payload = jwt.verify(token, SECRET) as { type?: string; sub?: unknown; role?: unknown };
  if (expectedType && payload.type !== expectedType) throw new Error('wrong token type');
  if (typeof payload.sub !== 'string') throw new Error('malformed token');
  if (expectedType === 'access' || payload.type === 'access') {
    return { sub: payload.sub, role: typeof payload.role === 'string' ? payload.role : '', type: 'access' };
  }
  return { sub: payload.sub, type: 'refresh' };
}
