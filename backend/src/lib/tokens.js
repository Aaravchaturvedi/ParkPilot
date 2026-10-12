const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev_only_change_me';
if (!process.env.JWT_SECRET) console.warn('[auth] JWT_SECRET missing, using dev fallback');

function signAccess(user) {
  return jwt.sign({ sub: user.id, role: user.role, type: 'access' }, SECRET, { expiresIn: '15m' });
}

function signRefresh(user) {
  return jwt.sign({ sub: user.id, type: 'refresh' }, SECRET, { expiresIn: '7d' });
}

function verify(token, expectedType) {
  const payload = jwt.verify(token, SECRET);
  if (expectedType && payload.type !== expectedType) throw new Error('wrong token type');
  return payload;
}

module.exports = { signAccess, signRefresh, verify };
