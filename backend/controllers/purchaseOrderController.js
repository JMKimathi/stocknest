const pool = require('../config/db');
const logActivity = require('../utils/activity');
const { notify } = require('../utils/notify');

const money = (n) => Math.round(Number(n) * 100) / 100;

// Checks the items sent from the browser and looks up each product.
// Returns { lines } or { error }.
async function buildLines(connection, items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'Add at least one product to the order' };
  }
  const merged = new Map();
  for (const item of items) {
    const id = Number(item.product_id);
    const qty = Number(item.quantity);
    const cost = Number(item.unit_cost);
    if (!Number.isInteger(id) || !Number.isInteger(qty) || qty <= 0) {
      return { error: 'Each line needs a product and a whole-number quantity above 0' };
    }
    if (!Number.isFinite(cost) || cost < 0) return { error: 'Unit cost cannot be negative' };
    const prev = merged.get(id);
    merged.set(id, { qty: (prev ? prev.qty : 0) + qty, cost: money(cost) });
  }

  const [products] = await connection.query(
    'SELECT id, name, sku, is_archived FROM products WHERE id IN (?)', [[...merged.keys()]]
  );
  const byId = new Map(products.map(p => [p.id, p]));
  const lines = [];
  for (const [id, { qty, cost }] of merged) {
    const p = byId.get(id);
    if (!p || p.is_archived) return { error: `Product #${id} cannot be ordered` };
    lines.push({ p, qty, cost, lineTotal: money(qty * cost) });
  }
  return { lines };
}

async function insertLines(connection, poId, lines) {
  for (const l of lines) {
    await connection.query(
      `INSERT INTO purchase_order_items (po_id, product_id, product_name, sku, quantity_ordered, unit_cost, line_total)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [poId, l.p.id, l.p.name, l.p.sku, l.qty, l.cost, l.lineTotal]
    );
  }
  return money(lines.reduce((s, l) => s + l.lineTotal, 0));
}

async function getSupplier(connection, supplierId) {
  if (!supplierId) return null;
  const [[s]] = await connection.query('SELECT id, name FROM suppliers WHERE id = ?', [supplierId]);
  return s || null;
}

// GET /api/purchase-orders?status=&supplier_id=&search=&page=
async function getPurchaseOrders(req, res) {
  try {
    const { status, supplier_id, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 20;

    let where = 'WHERE 1 = 1';
    const params = [];
    if (status) { where += ' AND po.status = ?'; params.push(status); }
    if (supplier_id) { where += ' AND po.supplier_id = ?'; params.push(supplier_id); }
    if (search) {
      where += ' AND (po.po_number LIKE ? OR po.supplier_name LIKE ? OR po.notes LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM purchase_orders po ${where}`, params);
    const [rows] = await pool.query(
      `SELECT po.*,
         (SELECT COALESCE(SUM(quantity_ordered), 0) FROM purchase_order_items WHERE po_id = po.id) AS units_ordered,
         (SELECT COALESCE(SUM(quantity_received), 0) FROM purchase_order_items WHERE po_id = po.id) AS units_received
       FROM purchase_orders po ${where}
       ORDER BY po.created_at DESC, po.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );
    const [counts] = await pool.query('SELECT status, COUNT(*) AS n FROM purchase_orders GROUP BY status');

    res.json({
      rows, total, page,
      pages: Math.max(1, Math.ceil(total / limit)),
      counts: Object.fromEntries(counts.map(c => [c.status, c.n]))
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

// GET /api/purchase-orders/:id
async function getPurchaseOrderById(req, res) {
  try {
    const [[po]] = await pool.query(
      `SELECT po.*, s.contact_person, s.phone AS supplier_phone, s.email AS supplier_email, s.address AS supplier_address
       FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id
       WHERE po.id = ?`, [req.params.id]
    );
    if (!po) return res.status(404).json({ message: 'Purchase order not found' });
    const [items] = await pool.query('SELECT * FROM purchase_order_items WHERE po_id = ? ORDER BY id', [po.id]);
    res.json({
      ...po, items,
      shop: {
        name: process.env.SHOP_NAME || 'StockNest Shop',
        address: process.env.SHOP_ADDRESS || '',
        phone: process.env.SHOP_PHONE || ''
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

// POST /api/purchase-orders
// { supplier_id, expected_date, notes, items: [{ product_id, quantity, unit_cost }], place_order }
async function createPurchaseOrder(req, res) {
  const { supplier_id, expected_date, notes, items, place_order } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const supplier = await getSupplier(connection, supplier_id);
    if (!supplier) {
      await connection.rollback();
      return res.status(400).json({ message: 'Choose a supplier' });
    }
    const { lines, error } = await buildLines(connection, items);
    if (error) {
      await connection.rollback();
      return res.status(400).json({ message: error });
    }

    const status = place_order ? 'ordered' : 'draft';
    const [result] = await connection.query(
      `INSERT INTO purchase_orders (supplier_id, supplier_name, status, expected_date, notes, created_by, created_by_name, ordered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [supplier.id, supplier.name, status, expected_date || null, notes?.trim() || null,
       req.user.id, req.user.name, place_order ? new Date() : null]
    );
    const poId = result.insertId;

    const d = new Date();
    const poNumber = `PO-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(poId).padStart(5, '0')}`;
    const total = await insertLines(connection, poId, lines);
    await connection.query('UPDATE purchase_orders SET po_number = ?, total_cost = ? WHERE id = ?', [poNumber, total, poId]);

    await connection.commit();
    await logActivity(req, {
      action: place_order ? 'po.order' : 'po.create', entityType: 'purchase_order', entityId: poId,
      details: `${place_order ? 'Placed' : 'Drafted'} ${poNumber} with ${supplier.name}: ${lines.length} product(s), KSh ${total.toFixed(2)}`
    });
    res.status(201).json({ id: poId, po_number: poNumber, status });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
}

// PUT /api/purchase-orders/:id  (drafts only - replaces supplier, dates, notes and lines)
async function updatePurchaseOrder(req, res) {
  const { supplier_id, expected_date, notes, items } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[po]] = await connection.query('SELECT * FROM purchase_orders WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!po) {
      await connection.rollback();
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    if (po.status !== 'draft') {
      await connection.rollback();
      return res.status(400).json({ message: 'Only draft orders can be edited' });
    }

    const supplier = await getSupplier(connection, supplier_id);
    if (!supplier) {
      await connection.rollback();
      return res.status(400).json({ message: 'Choose a supplier' });
    }
    const { lines, error } = await buildLines(connection, items);
    if (error) {
      await connection.rollback();
      return res.status(400).json({ message: error });
    }

    await connection.query('DELETE FROM purchase_order_items WHERE po_id = ?', [po.id]);
    const total = await insertLines(connection, po.id, lines);
    await connection.query(
      `UPDATE purchase_orders SET supplier_id = ?, supplier_name = ?, expected_date = ?, notes = ?, total_cost = ?
       WHERE id = ?`,
      [supplier.id, supplier.name, expected_date || null, notes?.trim() || null, total, po.id]
    );
    await connection.commit();

    await logActivity(req, {
      action: 'po.update', entityType: 'purchase_order', entityId: po.id,
      details: `Edited draft ${po.po_number}: ${lines.length} product(s), KSh ${total.toFixed(2)}`
    });
    res.json({ message: 'Purchase order updated' });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
}

// POST /api/purchase-orders/:id/order  (draft -> ordered)
async function placeOrder(req, res) {
  try {
    const [[po]] = await pool.query('SELECT * FROM purchase_orders WHERE id = ?', [req.params.id]);
    if (!po) return res.status(404).json({ message: 'Purchase order not found' });
    if (po.status !== 'draft') return res.status(400).json({ message: 'Only a draft can be placed as an order' });

    await pool.query(`UPDATE purchase_orders SET status = 'ordered', ordered_at = NOW() WHERE id = ?`, [po.id]);
    await logActivity(req, {
      action: 'po.order', entityType: 'purchase_order', entityId: po.id,
      details: `Placed ${po.po_number} with ${po.supplier_name}`
    });
    res.json({ message: `${po.po_number} marked as ordered` });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

// POST /api/purchase-orders/:id/receive  { items: [{ item_id, quantity }] }
// Adds the delivered quantities to stock. Can be done in several deliveries.
async function receiveItems(req, res) {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Enter the quantities that arrived' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[po]] = await connection.query('SELECT * FROM purchase_orders WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!po) {
      await connection.rollback();
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    if (!['ordered', 'partially_received'].includes(po.status)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Only placed orders can be received' });
    }

    const [poItems] = await connection.query('SELECT * FROM purchase_order_items WHERE po_id = ? FOR UPDATE', [po.id]);
    const byId = new Map(poItems.map(i => [i.id, i]));
    const received = [];

    for (const entry of items) {
      const qty = Number(entry.quantity);
      if (!qty) continue;
      const line = byId.get(Number(entry.item_id));
      if (!line) {
        await connection.rollback();
        return res.status(400).json({ message: 'One of the lines does not belong to this order' });
      }
      const remaining = line.quantity_ordered - line.quantity_received;
      if (!Number.isInteger(qty) || qty < 0 || qty > remaining) {
        await connection.rollback();
        return res.status(400).json({ message: `"${line.product_name}": you can receive at most ${remaining}` });
      }

      await connection.query(
        'UPDATE purchase_order_items SET quantity_received = quantity_received + ? WHERE id = ?', [qty, line.id]
      );
      line.quantity_received += qty;

      if (line.product_id) {
        // Stock goes up and the product's cost price becomes this delivery's cost
        await connection.query(
          'UPDATE products SET quantity = quantity + ?, cost_price = ? WHERE id = ?',
          [qty, line.unit_cost, line.product_id]
        );
        await connection.query(
          `INSERT INTO stock_transactions (product_id, user_id, type, quantity, reason)
           VALUES (?, ?, 'in', ?, ?)`,
          [line.product_id, req.user.id, qty, `Received on ${po.po_number}`]
        );
      }
      received.push(`${qty} x ${line.product_name}`);
    }

    if (!received.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Enter at least one quantity above 0' });
    }

    const complete = poItems.every(i => i.quantity_received >= i.quantity_ordered);
    await connection.query(
      `UPDATE purchase_orders SET status = ?, received_at = ${complete ? 'NOW()' : 'received_at'} WHERE id = ?`,
      [complete ? 'received' : 'partially_received', po.id]
    );
    await connection.commit();

    await logActivity(req, {
      action: 'po.receive', entityType: 'purchase_order', entityId: po.id,
      details: `Received on ${po.po_number}: ${received.join(', ')}${complete ? ' (order complete)' : ''}`
    });
    // Let whoever created the order know it has arrived (if someone else received it)
    if (complete && po.created_by && po.created_by !== req.user.id) {
      await notify({ userIds: [po.created_by] }, {
        type: 'po_received',
        title: `Delivered: ${po.po_number}`,
        message: `${req.user.name} received the full order from ${po.supplier_name}.`,
        link: 'purchase-orders.html', entityType: 'purchase_order', entityId: po.id
      });
    }
    res.json({ message: complete ? `${po.po_number} fully received` : `Delivery recorded on ${po.po_number}`, complete });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
}

// POST /api/purchase-orders/:id/cancel  { reason }   (admin)
// Stock that already arrived stays; only the outstanding part is cancelled.
async function cancelPurchaseOrder(req, res) {
  try {
    const [[po]] = await pool.query('SELECT * FROM purchase_orders WHERE id = ?', [req.params.id]);
    if (!po) return res.status(404).json({ message: 'Purchase order not found' });
    if (['received', 'cancelled'].includes(po.status)) {
      return res.status(400).json({ message: `This order is already ${po.status}` });
    }
    const reason = String(req.body.reason || '').trim();
    const notes = reason ? `${po.notes ? po.notes + ' | ' : ''}Cancelled: ${reason}`.slice(0, 500) : po.notes;

    await pool.query(
      `UPDATE purchase_orders SET status = 'cancelled', cancelled_at = NOW(), notes = ? WHERE id = ?`, [notes, po.id]
    );
    await logActivity(req, {
      action: 'po.cancel', entityType: 'purchase_order', entityId: po.id,
      details: `Cancelled ${po.po_number}${reason ? ': ' + reason : ''}`
    });
    res.json({ message: `${po.po_number} cancelled` });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

// DELETE /api/purchase-orders/:id  (drafts only)
async function deletePurchaseOrder(req, res) {
  try {
    const [[po]] = await pool.query('SELECT * FROM purchase_orders WHERE id = ?', [req.params.id]);
    if (!po) return res.status(404).json({ message: 'Purchase order not found' });
    if (po.status !== 'draft') {
      return res.status(400).json({ message: 'Only drafts can be deleted. Cancel a placed order instead.' });
    }
    await pool.query('DELETE FROM purchase_orders WHERE id = ?', [po.id]);
    await logActivity(req, {
      action: 'po.delete', entityType: 'purchase_order', entityId: po.id,
      details: `Deleted draft ${po.po_number}`
    });
    res.json({ message: 'Draft deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
  getPurchaseOrders, getPurchaseOrderById, createPurchaseOrder, updatePurchaseOrder,
  placeOrder, receiveItems, cancelPurchaseOrder, deletePurchaseOrder
};
