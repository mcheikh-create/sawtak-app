const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { identifier, pin } = req.body;
  if (!identifier || !pin) return res.status(400).json({ error: 'identifier and pin required' });

  const user = db.prepare(
    `SELECT * FROM contributors WHERE (phone = ? OR name = ?) AND type IN ('annotator','admin') LIMIT 1`
  ).get(identifier, identifier);

  if (!user) return res.status(401).json({ error: 'User not found' });
  if (!bcrypt.compareSync(String(pin), user.pin)) return res.status(401).json({ error: 'Wrong PIN' });

  db.prepare('UPDATE contributors SET last_active = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

  const token = jwt.sign({ id: user.id, name: user.name, type: user.type }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, name: user.name, type: user.type });
});

module.exports = router;
