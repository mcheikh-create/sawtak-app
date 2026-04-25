const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'sawtak-hassaniya-secret-2024';

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  const queryToken = req.query.token;
  const raw = header?.startsWith('Bearer ') ? header.slice(7) : queryToken;
  if (!raw) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(raw, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.type !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requireAnnotator(req, res, next) {
  if (!['annotator', 'admin'].includes(req.user.type)) {
    return res.status(403).json({ error: 'Annotator access required' });
  }
  next();
}

module.exports = { authenticate, requireAdmin, requireAnnotator, JWT_SECRET };
