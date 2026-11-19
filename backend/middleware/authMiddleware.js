const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// While a user must choose a new password, these are the only API calls allowed
const ALLOWED_BEFORE_PASSWORD_CHANGE = ['/api/auth/me', '/api/profile/password', '/api/notifications/count'];

// Checks the token AND re-reads the user from the database on every request,
// so a disabled account or a changed role takes effect immediately instead of
// waiting for the token to expire.
async function protect(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, role, is_active, is_approved, must_change_password FROM users WHERE id = ?',
      [decoded.id]
    );
    const user = rows[0];
    if (!user || !user.is_active || !user.is_approved) {
      return res.status(401).json({ message: 'Your account is disabled or no longer exists' });
    }

    const path = req.originalUrl.split('?')[0];
    if (user.must_change_password && !ALLOWED_BEFORE_PASSWORD_CHANGE.includes(path)) {
      return res.status(403).json({ message: 'Please choose a new password first', code: 'PASSWORD_CHANGE_REQUIRED' });
    }

    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    next();
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = protect;
