const pool = require('../config/db');
const { notify } = require('./notify');

// Looks for placed purchase orders whose expected delivery date has passed
// and tells the admins (once per order).
async function checkOverdueOrders() {
  try {
    const [orders] = await pool.query(
      `SELECT po.id, po.po_number, po.supplier_name, po.expected_date
       FROM purchase_orders po
       WHERE po.status IN ('ordered', 'partially_received')
         AND po.expected_date < CURDATE()
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.type = 'po_overdue' AND n.entity_type = 'purchase_order' AND n.entity_id = po.id)`
    );
    for (const po of orders) {
      await notify({ roles: ['admin'] }, {
        type: 'po_overdue',
        title: `Delivery overdue: ${po.po_number}`,
        message: `${po.supplier_name || 'The supplier'} was expected to deliver by ${new Date(po.expected_date).toLocaleDateString()}.`,
        link: 'purchase-orders.html',
        entityType: 'purchase_order', entityId: po.id
      });
    }
  } catch (err) {
    console.error('Overdue order check failed:', err.message);
  }
}

// Runs once on start-up and then every hour while the server is running
function startAlertJobs() {
  checkOverdueOrders();
  setInterval(checkOverdueOrders, 60 * 60 * 1000);
}

module.exports = { startAlertJobs, checkOverdueOrders };
