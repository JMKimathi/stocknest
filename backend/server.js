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

const app = express();

app.use(cors());
app.use(express.json());

// Serve the vanilla frontend directly from Express (optional convenience -
// you can also serve /frontend with a separate static server / Live Server)
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/products', productRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'StockNest API is running' }));

// Create a default admin account on first run if none exists yet
async function seedDefaultAdmin() {
  try {
    const [rows] = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (rows.length > 0) return;

    const name = process.env.DEFAULT_ADMIN_NAME || 'Admin';
    const email = process.env.DEFAULT_ADMIN_EMAIL || 'admin@stocknest.com';
    const password = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@12345';
    const password_hash = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')",
      [name, email, password_hash]
    );
    console.log(`Default admin created -> email: ${email}  password: ${password}`);
    console.log('Please log in and change this password immediately.');
  } catch (err) {
    console.error('Could not seed default admin:', err.message);
  }
}

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`StockNest API running on http://localhost:${PORT}`);
  await seedDefaultAdmin();
});
