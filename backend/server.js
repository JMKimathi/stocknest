require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const pool = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const productRoutes = require('./routes/productRoutes');
const profileRoutes = require('./routes/profileRoutes');
const activityRoutes = require('./routes/activityRoutes');
const salesRoutes = require('./routes/salesRoutes');
const purchaseOrderRoutes = require('./routes/purchaseOrderRoutes');
const reportRoutes = require('./routes/reportRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const { startAlertJobs } = require('./utils/alertJobs');

const app = express();

app.set('trust proxy', 'loopback'); // so req.ip is the real address behind a local proxy
// The website is served by this same server, so cross-origin requests are
// only allowed for addresses listed in CORS_ORIGIN (comma separated).
if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN.split(',').map(s => s.trim()) }));
}

// Basic security headers on every response
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(express.json({ limit: '5mb' })); // room for photos and CSV imports

// Serve the vanilla frontend directly from Express (optional convenience -
// you can also serve /frontend with a separate static server / Live Server)
app.use(express.static(path.join(__dirname, '../frontend')));
// Chart library for the reports page, served from node_modules (works offline)
app.use('/vendor/chart.js', express.static(path.join(__dirname, 'node_modules/chart.js/dist')));
app.use('/vendor/inter', express.static(path.join(__dirname, 'node_modules/@fontsource-variable/inter')));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/products', productRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'StockNest API is running' }));

// Optional: create an admin from .env on first run. Normally you leave the
// DEFAULT_ADMIN_* settings out and use the "Set up StockNest" page instead.
async function seedDefaultAdmin() {
  try {
    const email = process.env.DEFAULT_ADMIN_EMAIL;
    const password = process.env.DEFAULT_ADMIN_PASSWORD;
    if (!email || !password) return;

    const [rows] = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (rows.length > 0) return;

    const name = process.env.DEFAULT_ADMIN_NAME || 'Admin';
    const password_hash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (name, email, password_hash, role, must_change_password) VALUES (?, ?, ?, 'admin', 1)",
      [name, email, password_hash]
    );
    // The password itself is never printed to the console
    console.log(`Admin account created for ${email}. Sign in and choose a new password.`);
  } catch (err) {
    console.error('Could not seed default admin:', err.message);
  }
}

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`StockNest running on http://localhost:${PORT}`);
  await seedDefaultAdmin();
  startAlertJobs();
});
