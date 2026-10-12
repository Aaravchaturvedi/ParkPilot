const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { signAccess, signRefresh, verify } = require('../lib/tokens');

const ROLES = ['CUSTOMER', 'PARTNER', 'ADMIN'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PUBLIC_USER = { id: true, name: true, email: true, phone: true, role: true, kycStatus: true, createdAt: true };

function tokensFor(user) {
  return { accessToken: signAccess(user), refreshToken: signRefresh(user), tokenType: 'Bearer', expiresIn: '15m' };
}

async function register(req, res) {
  const { name, email, phone, password, role } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'name_email_password_required' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'invalid_email' });
  if (password.length < 6) return res.status(400).json({ error: 'password_too_short_min_6' });
  if (role && !ROLES.includes(role)) return res.status(400).json({ error: 'invalid_role' });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: 'email_taken' });
  if (phone) {
    const byPhone = await prisma.user.findUnique({ where: { phone } });
    if (byPhone) return res.status(409).json({ error: 'phone_taken' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, phone: phone || null, passwordHash, role: role || 'CUSTOMER' },
    select: PUBLIC_USER,
  });
  return res.status(201).json({ user, ...tokensFor(user) });
}

async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email_password_required' });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: 'invalid_credentials' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

  const { passwordHash: _ph, ...publicUser } = user;
  return res.json({ user: publicUser, ...tokensFor(user) });
}

async function refresh(req, res) {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken_required' });
  try {
    const payload = verify(refreshToken, 'refresh');
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: PUBLIC_USER });
    if (!user) return res.status(401).json({ error: 'invalid_token' });
    return res.json(tokensFor(user));
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

async function me(req, res) {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: PUBLIC_USER });
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  return res.json({ user });
}

// Mock KYC submit (Digio/Hyperverge integration is post-MVP Phase B).
async function submitKyc(req, res) {
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { kycStatus: 'SUBMITTED' },
    select: PUBLIC_USER,
  });
  return res.json({ user });
}

module.exports = { register, login, refresh, me, submitKyc };
