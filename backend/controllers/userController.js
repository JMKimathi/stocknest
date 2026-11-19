const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// GET /api/users
async function getUsers(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, phone, avatar, role, is_active, last_login_at, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

// POST /api/users  (admin creates a new user - admin or staff)
async function createUser(req, res) {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }
    const validRole = role === 'admin' ? 'admin' : 'staff';

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) {
      return res.status(409).json({ message: 'A user with this email already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, password_hash, validRole]
    );

    res.status(201).json({ id: result.insertId, name, email, role: validRole });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

// PUT /api/users/:id  (admin updates role/active status/name)
async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { name, role, is_active } = req.body;

    const [existing] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    if (!existing[0]) return res.status(404).json({ message: 'User not found' });

    if (role !== undefined && !['admin', 'staff'].includes(role)) {
      return res.status(400).json({ message: "Role must be 'admin' or 'staff'" });
    }

    const isSelf = Number(id) === Number(req.user.id);
    const demoting = role !== undefined && role !== existing[0].role && existing[0].role === 'admin';
    const disabling = is_active !== undefined && !Number(is_active) && existing[0].is_active;

    // An admin must not be able to lock themselves out
    if (isSelf && (demoting || disabling)) {
      return res.status(400).json({ message: 'You cannot remove your own admin role or disable your own account' });
    }

    // Always keep at least one active admin in the system
    if (existing[0].role === 'admin' && (demoting || disabling)) {
      const [[{ admins }]] = await pool.query(
        "SELECT COUNT(*) AS admins FROM users WHERE role = 'admin' AND is_active = 1"
      );
      if (admins <= 1) {
        return res.status(400).json({ message: 'There must be at least one active admin' });
      }
    }

    await pool.query(
      'UPDATE users SET name = ?, role = ?, is_active = ? WHERE id = ?',
      [
        name ?? existing[0].name,
        role ?? existing[0].role,
        is_active ?? existing[0].is_active,
        id
      ]
    );

    res.json({ message: 'User updated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

// DELETE /api/users/:id
async function deleteUser(req, res) {
  try {
    const { id } = req.params;

    if (Number(id) === Number(req.user.id)) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    const [[target]] = await pool.query('SELECT id, role, is_active FROM users WHERE id = ?', [id]);
    if (!target) return res.status(404).json({ message: 'User not found' });

    // Deleting a user would also delete every stock movement they recorded,
    // which breaks the audit trail. Such users must be disabled instead.
    const [[{ txCount }]] = await pool.query(
      'SELECT COUNT(*) AS txCount FROM stock_transactions WHERE user_id = ?', [id]
    );
    if (txCount > 0) {
      return res.status(409).json({
        message: `This user has ${txCount} stock record(s) in the history. Disable the account instead of deleting it.`
      });
    }

    if (target.role === 'admin' && target.is_active) {
      const [[{ admins }]] = await pool.query(
        "SELECT COUNT(*) AS admins FROM users WHERE role = 'admin' AND is_active = 1"
      );
      if (admins <= 1) return res.status(400).json({ message: 'There must be at least one active admin' });
    }

    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

module.exports = { getUsers, createUser, updateUser, deleteUser };
