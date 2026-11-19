const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const MAX_AVATAR_LENGTH = 400 * 1024; // ~300 KB image once base64 encoded
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/profile
async function getProfile(req, res) {
  try {
    const [[user]] = await pool.query(
      `SELECT id, name, email, phone, avatar, role, last_login_at, created_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    if (!user) return res.status(404).json({ message: 'User not found' });

    const [[stats]] = await pool.query(
      `SELECT
         COUNT(*) AS totalMovements,
         COALESCE(SUM(type = 'in'), 0) AS stockIns,
         COALESCE(SUM(type = 'out'), 0) AS stockOuts,
         MAX(created_at) AS lastMovementAt
       FROM stock_transactions WHERE user_id = ?`,
      [req.user.id]
    );
    const [recent] = await pool.query(
      `SELECT t.type, t.quantity, t.reason, t.created_at, p.name AS product_name
       FROM stock_transactions t
       JOIN products p ON t.product_id = p.id
       WHERE t.user_id = ?
       ORDER BY t.created_at DESC
       LIMIT 5`,
      [req.user.id]
    );

    res.json({ ...user, stats, recent });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

// PUT /api/profile  { name, email, phone }
async function updateProfile(req, res) {
  try {
    const { name, email, phone } = req.body;
    const [[current]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);

    const newName = name !== undefined ? String(name).trim() : current.name;
    const newEmail = email !== undefined ? String(email).trim().toLowerCase() : current.email;
    const newPhone = phone !== undefined ? (String(phone).trim() || null) : current.phone;

    if (!newName) return res.status(400).json({ message: 'Name cannot be empty' });
    if (!EMAIL_RE.test(newEmail)) return res.status(400).json({ message: 'Enter a valid email address' });
    if (newPhone && !/^[+0-9 ()-]{7,20}$/.test(newPhone)) {
      return res.status(400).json({ message: 'Enter a valid phone number' });
    }

    await pool.query(
      'UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?',
      [newName, newEmail, newPhone, req.user.id]
    );
    res.json({
      message: 'Profile updated',
      user: { id: current.id, name: newName, email: newEmail, phone: newPhone, role: current.role }
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Another account already uses this email' });
    }
    res.status(500).json({ message: 'Server error' });
  }
}

// PUT /api/profile/password  { currentPassword, newPassword }
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({ message: 'New password must be at least 8 characters with letters and numbers' });
    }

    const [[user]] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) return res.status(400).json({ message: 'Current password is incorrect' });
    if (await bcrypt.compare(newPassword, user.password_hash)) {
      return res.status(400).json({ message: 'New password must be different from the current one' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

// PUT /api/profile/avatar  { avatar: 'data:image/jpeg;base64,...' }  (null removes it)
async function updateAvatar(req, res) {
  try {
    const { avatar } = req.body;
    if (avatar !== null) {
      if (typeof avatar !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar)) {
        return res.status(400).json({ message: 'Photo must be a PNG, JPEG or WebP image' });
      }
      if (avatar.length > MAX_AVATAR_LENGTH) {
        return res.status(400).json({ message: 'Photo is too large' });
      }
    }
    await pool.query('UPDATE users SET avatar = ? WHERE id = ?', [avatar, req.user.id]);
    res.json({ message: avatar ? 'Photo updated' : 'Photo removed', avatar });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { getProfile, updateProfile, changePassword, updateAvatar };
