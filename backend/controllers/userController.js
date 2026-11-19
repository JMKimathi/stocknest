const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const logActivity = require('../utils/activity');
const { notify } = require('../utils/notify');
const { passwordProblem, temporaryPassword, EMAIL_RE } = require('../utils/passwords');

// GET /api/users
async function getUsers(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, phone, avatar, role, is_active, is_approved, must_change_password, last_login_at, created_at
       FROM users ORDER BY is_approved ASC, created_at DESC`
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
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ message: problem });
    if (!EMAIL_RE.test(String(email).trim())) return res.status(400).json({ message: 'Enter a valid email address' });

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) {
      return res.status(409).json({ message: 'A user with this email already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      // The admin chose this password, so the person must replace it at first sign-in
      'INSERT INTO users (name, email, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, 1)',
      [name, String(email).trim().toLowerCase(), password_hash, validRole]
    );

    await logActivity(req, { action: 'user.create', entityType: 'user', entityId: result.insertId, details: `Created ${validRole} account for ${name} (${email})` });
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

    const changes = [];
    if (role !== undefined && role !== existing[0].role) changes.push(`role ${existing[0].role} -> ${role}`);
    if (is_active !== undefined && Number(is_active) !== Number(existing[0].is_active)) {
      changes.push(Number(is_active) ? 'account enabled' : 'account disabled');
    }
    if (name !== undefined && name !== existing[0].name) changes.push(`renamed to ${name}`);
    await logActivity(req, {
      action: 'user.update', entityType: 'user', entityId: Number(id),
      details: `Updated ${existing[0].name}${changes.length ? ': ' + changes.join(', ') : ''}`
    });
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

    const [[target]] = await pool.query('SELECT id, name, email, role, is_active FROM users WHERE id = ?', [id]);
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
    await logActivity(req, { action: 'user.delete', entityType: 'user', entityId: Number(id), details: `Deleted account of ${target.name} (${target.email})` });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

// POST /api/users/:id/approve  (accept a sign-up request)
async function approveUser(req, res) {
  try {
    const [[user]] = await pool.query('SELECT id, name, email, is_approved FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.is_approved) return res.status(400).json({ message: 'This account is already approved' });

    await pool.query('UPDATE users SET is_approved = 1, is_active = 1 WHERE id = ?', [user.id]);
    await logActivity(req, { action: 'user.approve', entityType: 'user', entityId: user.id, details: `Approved account for ${user.name} (${user.email})` });
    await notify({ userIds: [user.id] }, {
      type: 'account_approved', title: 'Welcome to StockNest!',
      message: `${req.user.name} approved your account.`, link: 'dashboard.html'
    });
    res.json({ message: `${user.name} can now sign in` });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

// POST /api/users/:id/reset-password
// Sets a temporary password (shown once to the admin) that must be changed at next sign-in.
async function resetUserPassword(req, res) {
  try {
    const [[user]] = await pool.query('SELECT id, name, email FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.id === req.user.id) {
      return res.status(400).json({ message: 'Change your own password from My profile' });
    }

    const temporary = temporaryPassword();
    const hash = await bcrypt.hash(temporary, 10);
    await pool.query('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', [hash, user.id]);
    await logActivity(req, { action: 'user.reset_password', entityType: 'user', entityId: user.id, details: `Reset the password of ${user.name}` });

    res.json({ message: 'Password reset', temporaryPassword: temporary, email: user.email, name: user.name });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { getUsers, createUser, updateUser, deleteUser, approveUser, resetUserPassword };
