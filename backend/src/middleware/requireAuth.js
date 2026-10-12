const { verify } = require('../lib/tokens');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'missing_token' });
  try {
    const payload = verify(token, 'access');
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

module.exports = requireAuth;
