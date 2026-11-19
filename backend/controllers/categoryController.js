const pool = require('../config/db');
const logActivity = require('../utils/activity');

async function getCategories(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM categories ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function createCategory(req, res) {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ message: 'Category name is required' });

    const [result] = await pool.query(
      'INSERT INTO categories (name, description) VALUES (?, ?)',
      [name, description || null]
    );
    await logActivity(req, { action: 'category.create', entityType: 'category', entityId: result.insertId, details: `Created category "${name}"` });
    res.status(201).json({ id: result.insertId, name, description });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Category already exists' });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function updateCategory(req, res) {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const [existing] = await pool.query('SELECT * FROM categories WHERE id = ?', [id]);
    if (!existing[0]) return res.status(404).json({ message: 'Category not found' });
    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ message: 'Category name cannot be empty' });
    }

    // Fields that were not sent keep their current value
    await pool.query(
      'UPDATE categories SET name = ?, description = ? WHERE id = ?',
      [name ?? existing[0].name, description ?? existing[0].description, id]
    );
    await logActivity(req, { action: 'category.update', entityType: 'category', entityId: Number(id), details: `Updated category "${name ?? existing[0].name}"` });
    res.json({ message: 'Category updated successfully' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Another category already has this name' });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function deleteCategory(req, res) {
  try {
    const { id } = req.params;
    const [[cat]] = await pool.query('SELECT name FROM categories WHERE id = ?', [id]);
    if (!cat) return res.status(404).json({ message: 'Category not found' });
    await pool.query('DELETE FROM categories WHERE id = ?', [id]);
    await logActivity(req, { action: 'category.delete', entityType: 'category', entityId: Number(id), details: `Deleted category "${cat.name}"` });
    res.json({ message: 'Category deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };
