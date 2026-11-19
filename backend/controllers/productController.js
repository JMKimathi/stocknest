const pool = require('../config/db');
const logActivity = require('../utils/activity');
const { stockAlert } = require('../utils/notify');

const MAX_IMAGE_LENGTH = 600 * 1024; // ~450 KB picture once base64 encoded
const IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

// Every product column except the picture itself (pictures are fetched
// separately from /api/products/:id/image so lists stay small and fast)
const PRODUCT_COLUMNS = `
  p.id, p.name, p.sku, p.barcode, p.description, p.category_id, p.supplier_id,
  p.quantity, p.reorder_level, p.unit_price, p.cost_price, p.is_archived,
  p.created_at, p.updated_at,
  (p.image IS NOT NULL) AS has_image, UNIX_TIMESTAMP(p.updated_at) AS image_version`;

function cleanBarcode(value) {
  const b = value === undefined || value === null ? '' : String(value).trim();
  return b || null;
}

function checkImage(image) {
  if (image === undefined || image === null) return null;
  if (typeof image !== 'string' || !IMAGE_RE.test(image)) return 'Picture must be a PNG, JPEG or WebP image';
  if (image.length > MAX_IMAGE_LENGTH) return 'Picture is too large';
  return null;
}

function duplicateMessage(err) {
  return /barcode/i.test(err.sqlMessage || '')
    ? 'Another product already has this barcode'
    : 'A product with this SKU already exists';
}

// GET /api/products?search=&category_id=&supplier_id=&lowStock=true&archived=true
async function getProducts(req, res) {
  try {
    const { search, category_id, supplier_id, lowStock, archived } = req.query;

    let sql = `
      SELECT ${PRODUCT_COLUMNS}, c.name AS category_name, s.name AS supplier_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.is_archived = ?
    `;
    // Archived products are hidden unless ?archived=true is asked for
    const params = [archived === 'true' ? 1 : 0];

    if (search) {
      sql += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
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
    res.status(500).json({ message: 'Server error' });
  }
}

async function getProductById(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT ${PRODUCT_COLUMNS}, c.name AS category_name, s.name AS supplier_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       WHERE p.id = ?`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Product not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

// GET /api/products/:id/image  (public, so it works in <img src="...">)
async function getProductImage(req, res) {
  try {
    const [[row]] = await pool.query('SELECT image FROM products WHERE id = ?', [req.params.id]);
    const match = row && row.image && /^data:(image\/[a-z]+);base64,(.+)$/.exec(row.image);
    if (!match) return res.status(404).end();
    res.setHeader('Content-Type', match[1]);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(match[2], 'base64'));
  } catch (err) {
    res.status(500).end();
  }
}

async function createProduct(req, res) {
  try {
    const { name, sku, barcode, description, category_id, supplier_id, quantity,
            reorder_level, unit_price, cost_price, image } = req.body;
    if (!name || !sku) {
      return res.status(400).json({ message: 'Name and SKU are required' });
    }
    const qty = Number(quantity) || 0;
    if (!Number.isInteger(qty) || qty < 0) {
      return res.status(400).json({ message: 'Opening quantity must be a whole number, 0 or more' });
    }
    if (Number(unit_price) < 0 || Number(cost_price) < 0) {
      return res.status(400).json({ message: 'Prices cannot be negative' });
    }
    const imageError = checkImage(image);
    if (imageError) return res.status(400).json({ message: imageError });

    const [result] = await pool.query(
      `INSERT INTO products (name, sku, barcode, description, category_id, supplier_id, quantity,
         reorder_level, unit_price, cost_price, image)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, sku, cleanBarcode(barcode), description || null,
        category_id || null, supplier_id || null,
        qty, reorder_level ?? 5, unit_price || 0, cost_price || 0, image || null
      ]
    );

    // Log the opening stock as an "in" transaction for audit purposes
    if (qty > 0) {
      await pool.query(
        `INSERT INTO stock_transactions (product_id, user_id, type, quantity, reason)
         VALUES (?, ?, 'in', ?, 'Initial stock on product creation')`,
        [result.insertId, req.user.id, qty]
      );
    }

    await logActivity(req, { action: 'product.create', entityType: 'product', entityId: result.insertId, details: `Added product "${name}" (${sku}) with ${qty} in stock` });
    res.status(201).json({ id: result.insertId, name, sku });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: duplicateMessage(err) });
    res.status(500).json({ message: 'Server error' });
  }
}

// PUT /api/products/:id
// image: undefined = keep, null = remove, data URL = replace
async function updateProduct(req, res) {
  try {
    const { id } = req.params;
    const { name, sku, barcode, description, category_id, supplier_id,
            reorder_level, unit_price, cost_price, image } = req.body;

    const [existing] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    const old = existing[0];
    if (!old) return res.status(404).json({ message: 'Product not found' });
    if (Number(unit_price) < 0 || Number(cost_price) < 0) {
      return res.status(400).json({ message: 'Prices cannot be negative' });
    }
    const imageError = checkImage(image);
    if (imageError) return res.status(400).json({ message: imageError });

    // Note: quantity is intentionally NOT edited here directly.
    // Use POST /api/products/:id/stock so every change is logged.
    await pool.query(
      `UPDATE products
       SET name = ?, sku = ?, barcode = ?, description = ?, category_id = ?, supplier_id = ?,
           reorder_level = ?, unit_price = ?, cost_price = ?, image = ?
       WHERE id = ?`,
      [
        name ?? old.name,
        sku ?? old.sku,
        barcode !== undefined ? cleanBarcode(barcode) : old.barcode,
        description ?? old.description,
        category_id !== undefined ? (category_id || null) : old.category_id,
        supplier_id !== undefined ? (supplier_id || null) : old.supplier_id,
        reorder_level ?? old.reorder_level,
        unit_price ?? old.unit_price,
        cost_price ?? old.cost_price,
        image !== undefined ? image : old.image,
        id
      ]
    );

    const changes = [];
    if (unit_price !== undefined && Number(unit_price) !== Number(old.unit_price)) {
      changes.push(`price ${old.unit_price} -> ${unit_price}`);
    }
    if (cost_price !== undefined && Number(cost_price) !== Number(old.cost_price)) {
      changes.push(`cost ${old.cost_price} -> ${cost_price}`);
    }
    if (reorder_level !== undefined && Number(reorder_level) !== Number(old.reorder_level)) {
      changes.push(`reorder level ${old.reorder_level} -> ${reorder_level}`);
    }
    if (image !== undefined && image !== old.image) changes.push(image ? 'new picture' : 'picture removed');
    await logActivity(req, {
      action: 'product.update', entityType: 'product', entityId: Number(id),
      details: `Updated product "${name ?? old.name}"${changes.length ? ': ' + changes.join(', ') : ''}`
    });

    // Raising the reorder level can make a product "low" without any sale
    const newLevel = reorder_level ?? old.reorder_level;
    if (Number(newLevel) !== Number(old.reorder_level)) {
      await stockAlert({ ...old, reorder_level: Number(newLevel) }, Infinity, old.quantity);
    }

    res.json({ message: 'Product updated successfully' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: duplicateMessage(err) });
    res.status(500).json({ message: 'Server error' });
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
    res.status(500).json({ message: 'Server error' });
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
    res.status(500).json({ message: 'Server error' });
  }
}

// POST /api/products/:id/stock  { type: 'in' | 'out' | 'adjustment', quantity, reason }
async function adjustStock(req, res) {
  const { id } = req.params;
  const { type, reason } = req.body;
  const quantity = Number(req.body.quantity);

  if (!['in', 'out', 'adjustment'].includes(type)) {
    return res.status(400).json({ message: "Type must be 'in', 'out', or 'adjustment'" });
  }
  // An adjustment may set stock to 0 (e.g. after a count); in/out must move at least 1
  if (!Number.isInteger(quantity) || quantity < 0 || (quantity === 0 && type !== 'adjustment')) {
    return res.status(400).json({ message: 'Quantity must be a whole number above 0' });
  }

  const connection = await pool.getConnection();
  try {
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
    else newQuantity = quantity; // adjustment sets the exact value

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
    await stockAlert(product, product.quantity, newQuantity);
    res.json({ message: 'Stock updated successfully', quantity: newQuantity });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: 'Server error' });
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
    res.status(500).json({ message: 'Server error' });
  }
}

// GET /api/products/summary/dashboard
async function getDashboardSummary(req, res) {
  try {
    const [[stock]] = await pool.query(
      `SELECT COUNT(*) AS totalItems,
              COALESCE(SUM(quantity * unit_price), 0) AS totalValue,
              COALESCE(SUM(quantity <= reorder_level), 0) AS lowStockCount,
              COALESCE(SUM(quantity = 0), 0) AS outOfStockCount
       FROM products WHERE is_archived = 0`
    );
    const [[today]] = await pool.query(
      `SELECT COUNT(*) AS salesToday, COALESCE(SUM(total), 0) AS revenueToday
       FROM sales WHERE status = 'completed' AND created_at >= CURDATE()`
    );
    const [[po]] = await pool.query(
      `SELECT COALESCE(SUM(status IN ('ordered', 'partially_received')), 0) AS openOrders,
              COALESCE(SUM(status IN ('ordered', 'partially_received') AND expected_date < CURDATE()), 0) AS overdueOrders
       FROM purchase_orders`
    );
    const [recentActivity] = await pool.query(
      `SELECT t.*, p.name AS product_name, u.name AS user_name
       FROM stock_transactions t
       JOIN products p ON t.product_id = p.id
       JOIN users u ON t.user_id = u.id
       ORDER BY t.created_at DESC
       LIMIT 10`
    );

    res.json({
      totalItems: Number(stock.totalItems),
      totalValue: Number(stock.totalValue),
      lowStockCount: Number(stock.lowStockCount),
      outOfStockCount: Number(stock.outOfStockCount),
      salesToday: Number(today.salesToday),
      revenueToday: Number(today.revenueToday),
      openOrders: Number(po.openOrders),
      overdueOrders: Number(po.overdueOrders),
      recentActivity
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

// POST /api/products/import  { rows: [...], update_existing: true|false }   (admin)
// Each row: sku, name, barcode, description, category, supplier,
//           quantity, reorder_level, unit_price, cost_price
// New SKUs are created (missing categories/suppliers are created by name).
// Existing SKUs are updated when update_existing is true; their stock
// quantity is never overwritten - use stock in/out for that.
async function importProducts(req, res) {
  const { rows, update_existing } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ message: 'The file has no product rows' });
  }
  if (rows.length > 2000) {
    return res.status(400).json({ message: 'Import at most 2000 products at a time' });
  }

  const result = { created: 0, updated: 0, skipped: 0, errors: [] };
  const num = (v, fallback) => (v === undefined || v === null || String(v).trim() === '' ? fallback : Number(v));

  try {
    const [cats] = await pool.query('SELECT id, name FROM categories');
    const [sups] = await pool.query('SELECT id, name FROM suppliers');
    const catIds = new Map(cats.map(c => [c.name.toLowerCase(), c.id]));
    const supIds = new Map(sups.map(s => [s.name.toLowerCase(), s.id]));

    async function idFor(map, table, name) {
      const clean = String(name || '').trim();
      if (!clean) return null;
      const key = clean.toLowerCase();
      if (!map.has(key)) {
        const [r] = await pool.query(`INSERT INTO ${table} (name) VALUES (?)`, [clean.slice(0, 100)]);
        map.set(key, r.insertId);
      }
      return map.get(key);
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      const line = i + 2; // +1 for the header row, +1 because rows start at 1
      const sku = String(r.sku || '').trim();
      const name = String(r.name || '').trim();
      const qty = num(r.quantity, 0);
      const reorder = num(r.reorder_level, 5);
      const price = num(r.unit_price, 0);
      const cost = num(r.cost_price, 0);

      if (!sku || !name) { result.errors.push({ line, message: 'SKU and name are required' }); continue; }
      if (![qty, reorder].every(n => Number.isInteger(n) && n >= 0)) {
        result.errors.push({ line, message: 'Quantity and reorder level must be whole numbers' }); continue;
      }
      if (![price, cost].every(n => Number.isFinite(n) && n >= 0)) {
        result.errors.push({ line, message: 'Prices must be numbers, 0 or more' }); continue;
      }

      try {
        const categoryId = await idFor(catIds, 'categories', r.category);
        const supplierId = await idFor(supIds, 'suppliers', r.supplier);
        const [[existing]] = await pool.query('SELECT id FROM products WHERE sku = ?', [sku]);

        if (existing) {
          if (!update_existing) { result.skipped++; continue; }
          await pool.query(
            `UPDATE products SET name = ?, barcode = ?, description = ?, category_id = ?, supplier_id = ?,
               reorder_level = ?, unit_price = ?, cost_price = ? WHERE id = ?`,
            [name, cleanBarcode(r.barcode), r.description || null, categoryId, supplierId,
             reorder, price, cost, existing.id]
          );
          result.updated++;
        } else {
          const [ins] = await pool.query(
            `INSERT INTO products (name, sku, barcode, description, category_id, supplier_id, quantity,
               reorder_level, unit_price, cost_price)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, sku, cleanBarcode(r.barcode), r.description || null, categoryId, supplierId,
             qty, reorder, price, cost]
          );
          if (qty > 0) {
            await pool.query(
              `INSERT INTO stock_transactions (product_id, user_id, type, quantity, reason)
               VALUES (?, ?, 'in', ?, 'Opening stock from CSV import')`,
              [ins.insertId, req.user.id, qty]
            );
          }
          result.created++;
        }
      } catch (err) {
        result.errors.push({
          line,
          message: err.code === 'ER_DUP_ENTRY' ? duplicateMessage(err) : 'Could not save this row'
        });
      }
    }

    await logActivity(req, {
      action: 'product.import', entityType: 'product',
      details: `CSV import: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} failed`
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
  getProducts, getProductById, getProductImage, createProduct, updateProduct, deleteProduct, restoreProduct,
  adjustStock, getProductHistory, getDashboardSummary, importProducts
};
