const pool = require('../config/db');
const logActivity = require('../utils/activity');

// GET /api/products?search=&category_id=&lowStock=true&archived=true
async function getProducts(req, res) {
  try {
    const { search, category_id, supplier_id, lowStock, archived } = req.query;

    let sql = `
      SELECT p.*, c.name AS category_name, s.name AS supplier_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.is_archived = ?
    `;
    // Archived products are hidden unless ?archived=true is asked for
    const params = [archived === 'true' ? 1 : 0];

    if (search) {
      sql += ' AND (p.name LIKE ? OR p.sku LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (category_id) {
      sql += ' AND p.category_id = ?';
      params.push(category_id);
    }
    if (supplier_id) {
      sql += ' AND p.supplier_id = ?';
      params.push(supplier_id);
    }
    if (lowStock === 'true') {
      sql += ' AND p.quantity <= p.reorder_level';
    }

    sql += ' ORDER BY p.created_at DESC';

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function getProductById(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, c.name AS category_name, s.name AS supplier_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       WHERE p.id = ?`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Product not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function createProduct(req, res) {
  try {
    const { name, sku, description, category_id, supplier_id, quantity, reorder_level, unit_price } = req.body;
    if (!name || !sku) {
      return res.status(400).json({ message: 'Name and SKU are required' });
    }

    const [result] = await pool.query(
      `INSERT INTO products (name, sku, description, category_id, supplier_id, quantity, reorder_level, unit_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, sku, description || null,
        category_id || null, supplier_id || null,
        quantity || 0, reorder_level || 5, unit_price || 0
      ]
    );

    // Log the initial stock as an "in" transaction for audit purposes
    if (quantity && quantity > 0) {
      await pool.query(
        `INSERT INTO stock_transactions (product_id, user_id, type, quantity, reason)
         VALUES (?, ?, 'in', ?, 'Initial stock on product creation')`,
        [result.insertId, req.user.id, quantity]
      );
    }

    await logActivity(req, { action: 'product.create', entityType: 'product', entityId: result.insertId, details: `Added product "${name}" (${sku}) with ${quantity || 0} in stock` });
    res.status(201).json({ id: result.insertId, name, sku });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A product with this SKU already exists' });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function updateProduct(req, res) {
  try {
    const { id } = req.params;
    const { name, sku, description, category_id, supplier_id, reorder_level, unit_price } = req.body;

    const [existing] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    if (!existing[0]) return res.status(404).json({ message: 'Product not found' });

    // Note: quantity is intentionally NOT edited here directly.
    // Use POST /api/products/:id/stock to adjust quantity, so every
    // change is logged in stock_transactions.
    await pool.query(
      `UPDATE products
       SET name = ?, sku = ?, description = ?, category_id = ?, supplier_id = ?, reorder_level = ?, unit_price = ?
       WHERE id = ?`,
      [
        name ?? existing[0].name,
        sku ?? existing[0].sku,
        description ?? existing[0].description,
        category_id ?? existing[0].category_id,
        supplier_id ?? existing[0].supplier_id,
        reorder_level ?? existing[0].reorder_level,
        unit_price ?? existing[0].unit_price,
        id
      ]
    );

    const changes = [];
    if (unit_price !== undefined && Number(unit_price) !== Number(existing[0].unit_price)) {
      changes.push(`price ${existing[0].unit_price} -> ${unit_price}`);
    }
    if (reorder_level !== undefined && Number(reorder_level) !== Number(existing[0].reorder_level)) {
      changes.push(`reorder level ${existing[0].reorder_level} -> ${reorder_level}`);
    }
    await logActivity(req, {
      action: 'product.update', entityType: 'product', entityId: Number(id),
      details: `Updated product "${name ?? existing[0].name}"${changes.length ? ': ' + changes.join(', ') : ''}`
    });
    res.json({ message: 'Product updated successfully' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A product with this SKU already exists' });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

// DELETE /api/products/:id
// Products with stock history are archived (hidden, history kept).
// Only a product that never had any stock movement is removed for good.
async function deleteProduct(req, res) {
  try {
    const { id } = req.params;
    const [[product]] = await pool.query('SELECT id, name FROM products WHERE id = ?', [id]);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const [[{ txCount }]] = await pool.query(
      'SELECT COUNT(*) AS txCount FROM stock_transactions WHERE product_id = ?', [id]
    );

    if (txCount > 0) {
      await pool.query('UPDATE products SET is_archived = 1 WHERE id = ?', [id]);
      await logActivity(req, { action: 'product.archive', entityType: 'product', entityId: Number(id), details: `Archived product "${product.name}"` });
      return res.json({ message: 'Product archived. Its stock history has been kept.', archived: true });
    }

    await pool.query('DELETE FROM products WHERE id = ?', [id]);
    await logActivity(req, { action: 'product.delete', entityType: 'product', entityId: Number(id), details: `Deleted product "${product.name}"` });
    res.json({ message: 'Product deleted successfully', archived: false });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

// PATCH /api/products/:id/restore
async function restoreProduct(req, res) {
  try {
    const [result] = await pool.query(
      'UPDATE products SET is_archived = 0 WHERE id = ? AND is_archived = 1', [req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Archived product not found' });
    await logActivity(req, { action: 'product.restore', entityType: 'product', entityId: Number(req.params.id), details: 'Restored product from archive' });
    res.json({ message: 'Product restored' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

// POST /api/products/:id/stock  { type: 'in' | 'out' | 'adjustment', quantity, reason }
async function adjustStock(req, res) {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { type, quantity, reason } = req.body;

    if (!['in', 'out', 'adjustment'].includes(type)) {
      return res.status(400).json({ message: "Type must be 'in', 'out', or 'adjustment'" });
    }
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ message: 'Quantity must be a positive number' });
    }

    await connection.beginTransaction();

    const [rows] = await connection.query('SELECT * FROM products WHERE id = ? FOR UPDATE', [id]);
    const product = rows[0];
    if (!product) {
      await connection.rollback();
      return res.status(404).json({ message: 'Product not found' });
    }
    if (product.is_archived) {
      await connection.rollback();
      return res.status(400).json({ message: 'Restore this product before changing its stock' });
    }

    let newQuantity = product.quantity;
    if (type === 'in') newQuantity += quantity;
    else if (type === 'out') newQuantity -= quantity;
    else if (type === 'adjustment') newQuantity = quantity; // set to exact value

    if (newQuantity < 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'Insufficient stock for this operation' });
    }

    await connection.query('UPDATE products SET quantity = ? WHERE id = ?', [newQuantity, id]);
    await connection.query(
      `INSERT INTO stock_transactions (product_id, user_id, type, quantity, reason)
       VALUES (?, ?, ?, ?, ?)`,
      [id, req.user.id, type, quantity, reason || null]
    );

    await connection.commit();
    await logActivity(req, {
      action: `stock.${type}`, entityType: 'product', entityId: Number(id),
      details: `${type === 'adjustment' ? 'Set stock of' : type === 'in' ? 'Stock in for' : 'Stock out for'} "${product.name}": ` +
        `${type === 'adjustment' ? '' : quantity + ' units, '}${product.quantity} -> ${newQuantity}${reason ? ` (${reason})` : ''}`
    });
    res.json({ message: 'Stock updated successfully', quantity: newQuantity });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: 'Server error', error: err.message });
  } finally {
    connection.release();
  }
}

// GET /api/products/:id/history
async function getProductHistory(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT t.*, u.name AS user_name
       FROM stock_transactions t
       JOIN users u ON t.user_id = u.id
       WHERE t.product_id = ?
       ORDER BY t.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

// GET /api/products/summary/dashboard
async function getDashboardSummary(req, res) {
  try {
    const [[{ totalItems }]] = await pool.query('SELECT COUNT(*) AS totalItems FROM products WHERE is_archived = 0');
    const [[{ totalValue }]] = await pool.query(
      'SELECT COALESCE(SUM(quantity * unit_price), 0) AS totalValue FROM products WHERE is_archived = 0'
    );
    const [[{ lowStockCount }]] = await pool.query(
      'SELECT COUNT(*) AS lowStockCount FROM products WHERE is_archived = 0 AND quantity <= reorder_level'
    );
    const [recentActivity] = await pool.query(
      `SELECT t.*, p.name AS product_name, u.name AS user_name
       FROM stock_transactions t
       JOIN products p ON t.product_id = p.id
       JOIN users u ON t.user_id = u.id
       ORDER BY t.created_at DESC
       LIMIT 10`
    );

    res.json({ totalItems, totalValue, lowStockCount, recentActivity });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

module.exports = {
  getProducts, getProductById, createProduct, updateProduct, deleteProduct, restoreProduct,
  adjustStock, getProductHistory, getDashboardSummary
};
