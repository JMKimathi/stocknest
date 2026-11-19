const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const generateToken = require('../utils/generateToken');
const limiter = require('../utils/loginLimiter');
const logActivity = require('../utils/activity');

// POST /api/auth/login
async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    if (limiter.isBlocked(req)) {
      return res.status(429).json({ message: 'Too many failed attempts. Try again in 15 minutes.' });
    }

    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];

    const match = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!user || !match) {
      limiter.recordFailure(req);
      await logActivity(req, {
        action: 'auth.login_failed', entityType: 'auth',
        details: `Failed login for ${String(email).slice(0, 150)}`, user: user || null
      });
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    if (!user.is_active) {
      return res.status(403).json({ message: 'This account has been disabled. Contact an admin.' });
    }

    limiter.clearFailures(req);
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
    await logActivity(req, { action: 'auth.login', entityType: 'auth', entityId: user.id, details: 'Signed in', user });

    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar || null }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

// GET /api/auth/me
async function getMe(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

module.exports = { login, getMe };
