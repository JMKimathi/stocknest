const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// GET /api/users
async function getUsers(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at DESC'
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

    const [result] = await pool.query('DELETE FROM users WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

module.exports = { getUsers, createUser, updateUser, deleteUser };
