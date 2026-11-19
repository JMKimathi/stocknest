const pool = require('../config/db');

async function getSuppliers(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM suppliers ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function createSupplier(req, res) {
  try {
    const { name, contact_person, phone, email, address } = req.body;
    if (!name) return res.status(400).json({ message: 'Supplier name is required' });

    const [result] = await pool.query(
      'INSERT INTO suppliers (name, contact_person, phone, email, address) VALUES (?, ?, ?, ?, ?)',
      [name, contact_person || null, phone || null, email || null, address || null]
    );
    res.status(201).json({ id: result.insertId, name });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function updateSupplier(req, res) {
  try {
    const { id } = req.params;
    const { name, contact_person, phone, email, address } = req.body;

    const [existing] = await pool.query('SELECT * FROM suppliers WHERE id = ?', [id]);
    const s = existing[0];
    if (!s) return res.status(404).json({ message: 'Supplier not found' });
    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ message: 'Supplier name cannot be empty' });
    }

    // Fields that were not sent keep their current value
    await pool.query(
      'UPDATE suppliers SET name = ?, contact_person = ?, phone = ?, email = ?, address = ? WHERE id = ?',
      [
        name ?? s.name,
        contact_person ?? s.contact_person,
        phone ?? s.phone,
        email ?? s.email,
        address ?? s.address,
        id
      ]
    );
    res.json({ message: 'Supplier updated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function deleteSupplier(req, res) {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM suppliers WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Supplier not found' });
    res.json({ message: 'Supplier deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

module.exports = { getSuppliers, createSupplier, updateSupplier, deleteSupplier };
