const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const generateToken = require('../utils/generateToken');
const limiter = require('../utils/loginLimiter');
const logActivity = require('../utils/activity');
const { notify } = require('../utils/notify');
const { passwordProblem, EMAIL_RE } = require('../utils/passwords');

const signupAllowed = () => process.env.ALLOW_SIGNUP !== 'false';

function publicUser(user) {
  return {
    id: user.id, name: user.name, email: user.email, role: user.role,
    avatar: user.avatar || null, must_change_password: !!user.must_change_password
  };
}

async function userCount() {
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM users');
  return n;
}

// GET /api/auth/status  -> tells the sign-in pages what to show
async function getStatus(req, res) {
  try {
    res.json({
      needsSetup: (await userCount()) === 0,
      allowSignup: signupAllowed(),
      shopName: process.env.SHOP_NAME || 'StockNest'
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

// POST /api/auth/setup  { name, email, password }
// First-run only: creates the owner (admin) account when the database has no users.
async function setupOwner(req, res) {
  try {
    if ((await userCount()) > 0) {
      return res.status(409).json({ message: 'StockNest is already set up. Please sign in.' });
    }
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const { password } = req.body;
    if (!name) return res.status(400).json({ message: 'Enter your name' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ message: problem });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, is_active, is_approved, last_login_at)
       VALUES (?, ?, ?, 'admin', 1, 1, NOW())`,
      [name, email, hash]
    );
    const user = { id: result.insertId, name, email, role: 'admin' };
    await logActivity(req, { action: 'auth.setup', entityType: 'auth', entityId: user.id, details: 'Created the owner account', user });

    res.status(201).json({ token: generateToken(user), user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

// POST /api/auth/register  { name, email, phone, password }
// Anyone can ask for a staff account; an admin must approve it before it can sign in.
async function register(req, res) {
  try {
    if (!signupAllowed()) return res.status(403).json({ message: 'Sign-up is turned off. Ask an admin to add you.' });
    if ((await userCount()) === 0) return res.status(409).json({ message: 'Set up the owner account first.' });

    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').trim() || null;
    const { password } = req.body;
    if (!name) return res.status(400).json({ message: 'Enter your name' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });
    if (phone && !/^[+0-9 ()-]{7,20}$/.test(phone)) return res.status(400).json({ message: 'Enter a valid phone number' });
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ message: problem });

    const [[existing]] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ message: 'An account with this email already exists. Try signing in.' });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, role, is_active, is_approved)
       VALUES (?, ?, ?, ?, 'staff', 0, 0)`,
      [name, email, phone, hash]
    );

    await logActivity(req, {
      action: 'auth.register', entityType: 'user', entityId: result.insertId,
      details: `${name} (${email}) asked for an account`, user: { id: result.insertId, name }
    });
    await notify({ roles: ['admin'] }, {
      type: 'signup_request',
      title: `New account request: ${name}`,
      message: `${email} wants a staff account. Approve or reject it on the Users page.`,
      link: 'users.html', entityType: 'user', entityId: result.insertId
    });

    res.status(201).json({ message: 'Account created. An admin needs to approve it before you can sign in.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

// POST /api/auth/login
async function login(req, res) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const { password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    if (limiter.isBlocked(req)) {
      return res.status(429).json({ message: 'Too many failed attempts. Try again in 15 minutes.' });
    }

    const [[user]] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const match = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!user || !match) {
      limiter.recordFailure(req);
      await logActivity(req, {
        action: 'auth.login_failed', entityType: 'auth',
        details: `Failed login for ${email.slice(0, 150)}`, user: user || null
      });
      return res.status(401).json({ message: 'Wrong email or password' });
    }
    if (!user.is_approved) {
      return res.status(403).json({ message: 'Your account is waiting for an admin to approve it.' });
    }
    if (!user.is_active) {
      return res.status(403).json({ message: 'This account has been disabled. Contact an admin.' });
    }

    limiter.clearFailures(req);
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
    await logActivity(req, { action: 'auth.login', entityType: 'auth', entityId: user.id, details: 'Signed in', user });

    res.json({ token: generateToken(user), user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

// POST /api/auth/forgot-password  { email }
// There is no email service, so the request goes to the admins, who set a
// temporary password from the Users page. The reply is the same whether or
// not the email exists, so nobody can use this form to find accounts.
async function forgotPassword(req, res) {
  const reply = { message: 'If that email belongs to an account, an admin has been asked to reset the password.' };
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });

    const [[user]] = await pool.query('SELECT id, name, email FROM users WHERE email = ? AND is_approved = 1', [email]);
    if (user) {
      // At most one request per user per hour reaches the admins
      const [[recent]] = await pool.query(
        `SELECT id FROM notifications WHERE type = 'password_reset' AND entity_id = ?
         AND created_at > NOW() - INTERVAL 1 HOUR LIMIT 1`, [user.id]
      );
      if (!recent) {
        await notify({ roles: ['admin'] }, {
          type: 'password_reset',
          title: `Password reset request: ${user.name}`,
          message: `${user.email} forgot their password. Use "Reset password" on the Users page.`,
          link: 'users.html', entityType: 'user', entityId: user.id
        });
        await logActivity(req, {
          action: 'auth.forgot_password', entityType: 'user', entityId: user.id,
          details: `Password reset requested for ${user.email}`, user
        });
      }
    }
    res.json(reply);
  } catch (err) {
    res.json(reply);
  }
}

// GET /api/auth/me
async function getMe(req, res) {
  try {
    const [[user]] = await pool.query(
      'SELECT id, name, email, role, avatar, must_change_password, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(publicUser(user));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { getStatus, setupOwner, register, login, forgotPassword, getMe };
