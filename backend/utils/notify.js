const pool = require('../config/db');

// Creates one notification row per person who should see it.
//   to: { roles: ['admin', 'staff'] }  or  { userIds: [3, 5] }
// Like the activity log, a failure here never breaks the real request.
async function notify(to, { type, title, message = null, link = null, entityType = null, entityId = null }) {
  try {
    let users = [];
    if (to.userIds && to.userIds.length) {
      [users] = await pool.query('SELECT id FROM users WHERE is_active = 1 AND id IN (?)', [to.userIds]);
    } else {
      const roles = to.roles && to.roles.length ? to.roles : ['admin', 'staff'];
      [users] = await pool.query('SELECT id FROM users WHERE is_active = 1 AND role IN (?)', [roles]);
    }
    if (!users.length) return;

    const values = users.map(u => [u.id, type, title.slice(0, 150), message ? String(message).slice(0, 500) : null,
      link, entityType, entityId]);
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, link, entity_type, entity_id) VALUES ?`,
      [values]
    );
  } catch (err) {
    console.error('Could not create notification:', err.message);
  }
}

// Call after a product's quantity changes. Only alerts when stock CROSSES
// the reorder level (or hits zero), so people are not spammed on every sale.
async function stockAlert(product, oldQty, newQty) {
  const level = Number(product.reorder_level);
  if (newQty <= 0 && oldQty > 0) {
    await notify({ roles: ['admin', 'staff'] }, {
      type: 'out_of_stock',
      title: `Out of stock: ${product.name}`,
      message: `${product.name} (${product.sku}) has run out. Reorder level is ${level}.`,
      link: 'products.html?lowStock=true',
      entityType: 'product', entityId: product.id
    });
  } else if (newQty > 0 && newQty <= level && oldQty > level) {
    await notify({ roles: ['admin', 'staff'] }, {
      type: 'low_stock',
      title: `Low stock: ${product.name}`,
      message: `Only ${newQty} left of ${product.name} (${product.sku}). Reorder level is ${level}.`,
      link: 'products.html?lowStock=true',
      entityType: 'product', entityId: product.id
    });
  }
}

module.exports = { notify, stockAlert };
