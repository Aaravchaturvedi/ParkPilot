import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { signAccess, signRefresh, verify } from '../lib/tokens';


const ROLES = ['CUSTOMER', 'PARTNER', 'ADMIN'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PUBLIC_USER = { id: true, name: true, email: true, phone: true, role: true, kycStatus: true, createdAt: true } as const;

interface TokenUser {
  id: string;
  role: string;
}

function tokensFor(user: TokenUser): { accessToken: string; refreshToken: string; tokenType: 'Bearer'; expiresIn: string } {
  return { accessToken: signAccess(user), refreshToken: signRefresh(user), tokenType: 'Bearer', expiresIn: '15m' };
}

export async function register(req: Request, res: Response): Promise<void> {
  const { name, email, phone, password, role } = (req.body || {}) as {
    name?: string;
    email?: string;
    phone?: string;
    password?: string;
    role?: string;
  };
  if (!name || !email || !password) {
    res.status(400).json({ error: 'name_email_password_required' });
    return;
  }
  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: 'invalid_email' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'password_too_short_min_6' });
    return;
  }
  if (role && !ROLES.includes(role)) {
    res.status(400).json({ error: 'invalid_role' });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'email_taken' });
    return;
  }
  if (phone) {
    const byPhone = await prisma.user.findUnique({ where: { phone } });
    if (byPhone) {
      res.status(409).json({ error: 'phone_taken' });
      return;
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, phone: phone || null, passwordHash, role: (role || 'CUSTOMER') as 'CUSTOMER' | 'PARTNER' | 'ADMIN' },
    select: PUBLIC_USER,
  });
  res.status(201).json({ user, ...tokensFor(user) });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = (req.body || {}) as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'email_password_required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }

  const { passwordHash: _ph, ...publicUser } = user;
  res.json({ user: publicUser, ...tokensFor(user) });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = (req.body || {}) as { refreshToken?: string };
  if (!refreshToken) {
    res.status(400).json({ error: 'refreshToken_required' });
    return;
  }
  try {
    const payload = verify(refreshToken, 'refresh');
    if (payload.type !== 'refresh') throw new Error('wrong token type');
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: PUBLIC_USER });
    if (!user) {
      res.status(401).json({ error: 'invalid_token' });
      return;
    }
    res.json(tokensFor(user));
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: PUBLIC_USER });
  if (!user) {
    res.status(404).json({ error: 'user_not_found' });
    return;
  }
  res.json({ user });
}

// Mock KYC submit (Digio/Hyperverge integration is post-MVP Phase B).
export async function submitKyc(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { kycStatus: 'SUBMITTED' },
    select: PUBLIC_USER,
  });
  res.json({ user });
}
