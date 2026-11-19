const pool = require('../config/db');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Reads ?from=YYYY-MM-DD&to=YYYY-MM-DD (defaults to the last 30 days)
function getRange(query) {
  const today = new Date();
  const monthAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
  const from = DATE_RE.test(query.from || '') ? query.from : isoDay(monthAgo);
  const to = DATE_RE.test(query.to || '') ? query.to : isoDay(today);
  return { from, to, start: `${from} 00:00:00`, end: `${to} 23:59:59` };
}

// One row per day (or per month for long ranges), with empty periods filled in
function fillSeries(rows, from, to, monthly) {
  const map = new Map(rows.map(r => [r.period, r]));
  const out = [];
  const d = new Date(`${from}T00:00:00`);
  const last = new Date(`${to}T00:00:00`);
  if (monthly) d.setDate(1);
  while (d <= last) {
    const key = monthly ? isoDay(d).slice(0, 7) : isoDay(d);
    const r = map.get(key);
    out.push({ period: key, revenue: r ? Number(r.revenue) : 0, sales: r ? Number(r.sales) : 0 });
    if (monthly) d.setMonth(d.getMonth() + 1); else d.setDate(d.getDate() + 1);
  }
  return out;
}

// GET /api/reports/overview?from=&to=
async function getOverview(req, res) {
  try {
    const { from, to, start, end } = getRange(req.query);
    const range = [start, end];
    const days = (new Date(to) - new Date(from)) / 86400000 + 1;
    const monthly = days > 92;

    const SOLD = `FROM sale_items si
                  JOIN sales s ON s.id = si.sale_id
                  LEFT JOIN products p ON p.id = si.product_id
                  WHERE s.status = 'completed' AND s.created_at BETWEEN ? AND ?`;

    const [
      [[sales]], [[items]], [[purchases]], [series], [topProducts],
      [byCategory], [payments], [valuation], [slowMovers]
    ] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS revenue,
                COALESCE(SUM(discount), 0) AS discounts, COALESCE(AVG(total), 0) AS avgSale
         FROM sales WHERE status = 'completed' AND created_at BETWEEN ? AND ?`, range),
      pool.query(
        `SELECT COALESCE(SUM(si.quantity), 0) AS units,
                COALESCE(SUM(si.quantity * COALESCE(si.unit_cost, p.cost_price, 0)), 0) AS cost
         ${SOLD}`, range),
      pool.query(
        `SELECT COUNT(*) AS count, COALESCE(SUM(total_cost), 0) AS total
         FROM purchase_orders
         WHERE status IN ('ordered', 'partially_received', 'received') AND ordered_at BETWEEN ? AND ?`, range),
      pool.query(
        `SELECT DATE_FORMAT(created_at, ?) AS period, SUM(total) AS revenue, COUNT(*) AS sales
         FROM sales WHERE status = 'completed' AND created_at BETWEEN ? AND ?
         GROUP BY period ORDER BY period`, [monthly ? '%Y-%m' : '%Y-%m-%d', ...range]),
      pool.query(
        `SELECT si.product_name AS name, SUM(si.quantity) AS units, SUM(si.line_total) AS revenue
         ${SOLD}
         GROUP BY si.product_id, si.product_name ORDER BY revenue DESC LIMIT 10`, range),
      pool.query(
        `SELECT COALESCE(c.name, 'Uncategorised') AS name, SUM(si.line_total) AS revenue, SUM(si.quantity) AS units
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         LEFT JOIN products p ON p.id = si.product_id
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE s.status = 'completed' AND s.created_at BETWEEN ? AND ?
         GROUP BY name ORDER BY revenue DESC`, range),
      pool.query(
        `SELECT payment_method AS method, COUNT(*) AS count, SUM(total) AS revenue
         FROM sales WHERE status = 'completed' AND created_at BETWEEN ? AND ?
         GROUP BY payment_method ORDER BY revenue DESC`, range),
      pool.query(
        `SELECT COALESCE(c.name, 'Uncategorised') AS name, COUNT(*) AS products, SUM(p.quantity) AS units,
                SUM(p.quantity * p.cost_price) AS costValue, SUM(p.quantity * p.unit_price) AS retailValue
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.is_archived = 0
         GROUP BY name ORDER BY retailValue DESC`),
      pool.query(
        `SELECT p.id, p.name, p.sku, p.quantity, p.quantity * p.unit_price AS value,
                (SELECT MAX(s2.created_at) FROM sale_items si2 JOIN sales s2 ON s2.id = si2.sale_id
                 WHERE si2.product_id = p.id AND s2.status = 'completed') AS lastSold
         FROM products p
         WHERE p.is_archived = 0 AND p.quantity > 0
           AND p.id NOT IN (
             SELECT si.product_id FROM sale_items si JOIN sales s ON s.id = si.sale_id
             WHERE s.status = 'completed' AND s.created_at BETWEEN ? AND ? AND si.product_id IS NOT NULL)
         ORDER BY value DESC LIMIT 10`, range)
    ]);

    const revenue = Number(sales.revenue);
    const cost = Number(items.cost);
    const grossProfit = revenue - cost;

    res.json({
      range: { from, to, monthly },
      summary: {
        revenue,
        salesCount: Number(sales.count),
        avgSale: Number(sales.avgSale),
        discounts: Number(sales.discounts),
        unitsSold: Number(items.units),
        costOfGoods: cost,
        grossProfit,
        margin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
        purchaseOrders: Number(purchases.count),
        purchasesTotal: Number(purchases.total)
      },
      series: fillSeries(series, from, to, monthly),
      topProducts,
      byCategory,
      payments,
      valuation,
      slowMovers
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

// ---------- CSV export ----------

// Quotes every cell and blocks spreadsheet formula injection (=, +, -, @)
function toCsv(columns, rows) {
  const cell = (v) => {
    let s = v === null || v === undefined ? '' : (v instanceof Date ? v.toISOString().replace('T', ' ').slice(0, 19) : String(v));
    if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [columns.map(c => cell(c.label)).join(',')];
  rows.forEach(r => lines.push(columns.map(c => cell(r[c.key])).join(',')));
  return '﻿' + lines.join('\r\n'); // BOM so Excel opens it as UTF-8
}

const EXPORTS = {
  sales: {
    sql: `SELECT receipt_no, created_at, cashier_name, customer_name, customer_phone, payment_method, payment_ref,
                 subtotal, discount, total, status, void_reason
          FROM sales WHERE created_at BETWEEN ? AND ? ORDER BY created_at`,
    columns: [['receipt_no', 'Receipt'], ['created_at', 'Date'], ['cashier_name', 'Cashier'], ['customer_name', 'Customer'],
      ['customer_phone', 'Phone'], ['payment_method', 'Payment'], ['payment_ref', 'Payment ref'], ['subtotal', 'Subtotal'],
      ['discount', 'Discount'], ['total', 'Total'], ['status', 'Status'], ['void_reason', 'Void reason']]
  },
  'sale-items': {
    sql: `SELECT s.receipt_no, s.created_at, s.status, si.product_name, si.sku, si.quantity, si.unit_price,
                 COALESCE(si.unit_cost, p.cost_price) AS unit_cost, si.line_total
          FROM sale_items si JOIN sales s ON s.id = si.sale_id LEFT JOIN products p ON p.id = si.product_id
          WHERE s.created_at BETWEEN ? AND ? ORDER BY s.created_at, si.id`,
    columns: [['receipt_no', 'Receipt'], ['created_at', 'Date'], ['status', 'Sale status'], ['product_name', 'Product'],
      ['sku', 'SKU'], ['quantity', 'Qty'], ['unit_price', 'Unit price'], ['unit_cost', 'Unit cost'], ['line_total', 'Line total']]
  },
  stock: {
    ranged: false,
    sql: `SELECT p.sku, p.name, c.name AS category, s.name AS supplier, p.quantity, p.reorder_level,
                 p.cost_price, p.unit_price, p.quantity * p.cost_price AS cost_value, p.quantity * p.unit_price AS retail_value,
                 IF(p.is_archived, 'Archived', IF(p.quantity <= p.reorder_level, 'Low stock', 'In stock')) AS status
          FROM products p LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN suppliers s ON s.id = p.supplier_id
          ORDER BY p.name`,
    columns: [['sku', 'SKU'], ['name', 'Product'], ['category', 'Category'], ['supplier', 'Supplier'], ['quantity', 'Qty'],
      ['reorder_level', 'Reorder level'], ['cost_price', 'Cost price'], ['unit_price', 'Selling price'],
      ['cost_value', 'Stock value (cost)'], ['retail_value', 'Stock value (retail)'], ['status', 'Status']]
  },
  movements: {
    sql: `SELECT t.created_at, p.name AS product, p.sku, t.type, t.quantity, t.reason, u.name AS user_name
          FROM stock_transactions t JOIN products p ON p.id = t.product_id JOIN users u ON u.id = t.user_id
          WHERE t.created_at BETWEEN ? AND ? ORDER BY t.created_at`,
    columns: [['created_at', 'Date'], ['product', 'Product'], ['sku', 'SKU'], ['type', 'Type'], ['quantity', 'Qty'],
      ['reason', 'Reason'], ['user_name', 'By']]
  },
  'purchase-orders': {
    sql: `SELECT po_number, supplier_name, status, created_at, ordered_at, expected_date, received_at, total_cost, created_by_name
          FROM purchase_orders WHERE created_at BETWEEN ? AND ? ORDER BY created_at`,
    columns: [['po_number', 'PO number'], ['supplier_name', 'Supplier'], ['status', 'Status'], ['created_at', 'Created'],
      ['ordered_at', 'Ordered'], ['expected_date', 'Expected'], ['received_at', 'Received'], ['total_cost', 'Total cost'],
      ['created_by_name', 'Created by']]
  }
};

// GET /api/reports/export/:type?from=&to=
async function exportCsv(req, res) {
  const def = EXPORTS[req.params.type];
  if (!def) return res.status(404).json({ message: 'Unknown export' });
  try {
    const { from, to, start, end } = getRange(req.query);
    const [rows] = await pool.query(def.sql, def.ranged === false ? [] : [start, end]);
    const csv = toCsv(def.columns.map(([key, label]) => ({ key, label })), rows);
    const name = def.ranged === false
      ? `stocknest-${req.params.type}-${isoDay(new Date())}.csv`
      : `stocknest-${req.params.type}-${from}-to-${to}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { getOverview, exportCsv };
