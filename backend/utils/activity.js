const pool = require('../config/db');

// Writes one row to activity_log. Logging must never break the real
// request, so any database error here is only printed to the console.
//
// logActivity(req, { action, entityType, entityId, details, user })
//   user defaults to req.user (the logged-in person)
async function logActivity(req, { action, entityType = null, entityId = null, details = null, user } = {}) {
  try {
    const who = user !== undefined ? user : req.user;
    await pool.query(
      `INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        who ? who.id : null,
        who ? who.name : null,
        action,
        entityType,
        entityId,
        details ? String(details).slice(0, 500) : null,
        req.ip || null
      ]
    );
  } catch (err) {
    console.error('Could not write activity log:', err.message);
  }
}

module.exports = logActivity;
