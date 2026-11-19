const pool = require('../config/db');

// GET /api/activity?search=&user_id=&entity_type=&from=&to=&page=1&limit=25
async function getActivity(req, res) {
  try {
    const { search, user_id, entity_type, from, to } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

    let where = 'WHERE 1 = 1';
    const params = [];

    if (search) {
      where += ' AND (a.details LIKE ? OR a.action LIKE ? OR a.user_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (user_id) { where += ' AND a.user_id = ?'; params.push(user_id); }
    if (entity_type) { where += ' AND a.entity_type = ?'; params.push(entity_type); }
    if (from) { where += ' AND a.created_at >= ?'; params.push(`${from} 00:00:00`); }
    if (to) { where += ' AND a.created_at <= ?'; params.push(`${to} 23:59:59`); }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM activity_log a ${where}`, params);
    const [rows] = await pool.query(
      `SELECT a.* FROM activity_log a ${where}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );

    res.json({ rows, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { getActivity };
