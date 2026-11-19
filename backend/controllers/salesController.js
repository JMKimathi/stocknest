const pool = require('../config/db');
const logActivity = require('../utils/activity');

const PAYMENT_METHODS = ['cash', 'mpesa', 'card', 'bank'];
const money = (n) => Math.round(Number(n) * 100) / 100;

function shopInfo() {
  return {
    name: process.env.SHOP_NAME || 'StockNest Shop',
    address: process.env.SHOP_ADDRESS || '',
    phone: process.env.SHOP_PHONE || ''
  };
}

// POST /api/sales
// { items: [{ product_id, quantity }], discount, payment_method, payment_ref,
//   amount_paid, customer_name, customer_phone }
async function createSale(req, res) {
  const { items, discount = 0, payment_method = 'cash', payment_ref,
          amount_paid, customer_name, customer_phone } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Add at least one product to the sale' });
  }
  if (!PAYMENT_METHODS.includes(payment_method)) {
    return res.status(400).json({ message: 'Unknown payment method' });
  }

  // Merge repeated lines of the same product and check the quantities
  const wanted = new Map();
  for (const item of items) {
    const id = Number(item.product_id);
    const qty = Number(item.quantity);
    if (!Number.isInteger(id) || !Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({ message: 'Each item needs a product and a whole-number quantity above 0' });
    }
    wanted.set(id, (wanted.get(id) || 0) + qty);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Lock the products so two cashiers cannot sell the same last item
    const [products] = await connection.query(
      'SELECT * FROM products WHERE id IN (?) FOR UPDATE', [[...wanted.keys()]]
    );
    const byId = new Map(products.map(p => [p.id, p]));

    const lines = [];
    for (const [id, qty] of wanted) {
      const p = byId.get(id);
      if (!p || p.is_archived) {
        await connection.rollback();
        return res.status(400).json({ message: `Product #${id} is not available for sale` });
      }
      if (p.quantity < qty) {
        await connection.rollback();
        return res.status(400).json({ message: `Only ${p.quantity} of "${p.name}" left in stock` });
      }
      // Prices always come from the database, never from the browser
      lines.push({ p, qty, unitPrice: money(p.unit_price), unitCost: money(p.cost_price || 0), lineTotal: money(p.unit_price * qty) });
    }

    const subtotal = money(lines.reduce((sum, l) => sum + l.lineTotal, 0));
    const disc = money(discount || 0);
    if (disc < 0 || disc > subtotal) {
      await connection.rollback();
      return res.status(400).json({ message: 'Discount must be between 0 and the subtotal' });
    }
    const total = money(subtotal - disc);
    const paid = amount_paid === undefined || amount_paid === null || amount_paid === ''
      ? total : money(amount_paid);
    if (paid < total) {
      await connection.rollback();
      return res.status(400).json({ message: 'Amount paid is less than the total' });
    }
    const change = payment_method === 'cash' ? money(paid - total) : 0;

    const [saleResult] = await connection.query(
      `INSERT INTO sales (user_id, cashier_name, customer_name, customer_phone, payment_method,
         payment_ref, subtotal, discount, total, amount_paid, change_due)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, req.user.name, customer_name?.trim() || null, customer_phone?.trim() || null,
       payment_method, payment_ref?.trim() || null, subtotal, disc, total,
       payment_method === 'cash' ? paid : total, change]
    );
    const saleId = saleResult.insertId;

    const d = new Date();
    const datePart = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const receiptNo = `RCP-${datePart}-${String(saleId).padStart(5, '0')}`;
    await connection.query('UPDATE sales SET receipt_no = ? WHERE id = ?', [receiptNo, saleId]);

    for (const l of lines) {
      await connection.query(
        `INSERT INTO sale_items (sale_id, product_id, product_name, sku, quantity, unit_price, unit_cost, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [saleId, l.p.id, l.p.name, l.p.sku, l.qty, l.unitPrice, l.unitCost, l.lineTotal]
      );
      await connection.query('UPDATE products SET quantity = quantity - ? WHERE id = ?', [l.qty, l.p.id]);
      await connection.query(
        `INSERT INTO stock_transactions (product_id, user_id, type, quantity, reason)
         VALUES (?, ?, 'out', ?, ?)`,
        [l.p.id, req.user.id, l.qty, `Sale ${receiptNo}`]
      );
    }

    await connection.commit();
    await logActivity(req, {
      action: 'sale.create', entityType: 'sale', entityId: saleId,
      details: `Sale ${receiptNo}: ${lines.length} item(s), total KSh ${total.toFixed(2)} via ${payment_method}`
    });

    res.status(201).json({ id: saleId, receipt_no: receiptNo, total, change_due: change });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
}

// GET /api/sales?from=&to=&search=&status=&payment_method=&page=
async function getSales(req, res) {
  try {
    const { from, to, search, status, payment_method } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    let where = 'WHERE 1 = 1';
    const params = [];
    if (from) { where += ' AND s.created_at >= ?'; params.push(`${from} 00:00:00`); }
    if (to) { where += ' AND s.created_at <= ?'; params.push(`${to} 23:59:59`); }
    if (status) { where += ' AND s.status = ?'; params.push(status); }
    if (payment_method) { where += ' AND s.payment_method = ?'; params.push(payment_method); }
    if (search) {
      where += ' AND (s.receipt_no LIKE ? OR s.customer_name LIKE ? OR s.customer_phone LIKE ? OR s.cashier_name LIKE ?)';
      params.push(...Array(4).fill(`%${search}%`));
    }

    const [[summary]] = await pool.query(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(CASE WHEN s.status = 'completed' THEN s.total END), 0) AS revenue,
              COALESCE(SUM(CASE WHEN s.status = 'completed' THEN s.discount END), 0) AS discounts,
              COALESCE(SUM(s.status = 'voided'), 0) AS voided
       FROM sales s ${where}`, params
    );
    const [rows] = await pool.query(
      `SELECT s.*, (SELECT COALESCE(SUM(quantity), 0) FROM sale_items WHERE sale_id = s.id) AS item_count
       FROM sales s ${where}
       ORDER BY s.created_at DESC, s.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );

    res.json({ rows, summary, page, pages: Math.max(1, Math.ceil(summary.count / limit)) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

// GET /api/sales/:id  (one receipt with its items)
async function getSaleById(req, res) {
  try {
    const [[sale]] = await pool.query('SELECT * FROM sales WHERE id = ?', [req.params.id]);
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    const [items] = await pool.query('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id', [sale.id]);
    res.json({ ...sale, items, shop: shopInfo() });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

// POST /api/sales/:id/void  { reason }   (admin only)
// Marks the sale as voided and puts every item back into stock.
async function voidSale(req, res) {
  const reason = String(req.body.reason || '').trim();
  if (!reason) return res.status(400).json({ message: 'Give a reason for voiding this sale' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[sale]] = await connection.query('SELECT * FROM sales WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!sale) {
      await connection.rollback();
      return res.status(404).json({ message: 'Sale not found' });
    }
    if (sale.status === 'voided') {
      await connection.rollback();
      return res.status(400).json({ message: 'This sale is already voided' });
    }

    const [items] = await connection.query('SELECT * FROM sale_items WHERE sale_id = ?', [sale.id]);
    for (const item of items) {
      if (!item.product_id) continue; // product was deleted, nothing to put back
      await connection.query('UPDATE products SET quantity = quantity + ? WHERE id = ?', [item.quantity, item.product_id]);
      await connection.query(
        `INSERT INTO stock_transactions (product_id, user_id, type, quantity, reason)
         VALUES (?, ?, 'in', ?, ?)`,
        [item.product_id, req.user.id, item.quantity, `Void of ${sale.receipt_no}`]
      );
    }

    await connection.query(
      `UPDATE sales SET status = 'voided', void_reason = ?, voided_by = ?, voided_at = NOW() WHERE id = ?`,
      [reason.slice(0, 255), req.user.name, sale.id]
    );
    await connection.commit();

    await logActivity(req, {
      action: 'sale.void', entityType: 'sale', entityId: sale.id,
      details: `Voided ${sale.receipt_no} (KSh ${Number(sale.total).toFixed(2)}): ${reason}`
    });
    res.json({ message: `Sale ${sale.receipt_no} voided and stock returned` });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
}

module.exports = { createSale, getSales, getSaleById, voidSale };
