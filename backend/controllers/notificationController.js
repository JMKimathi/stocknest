const pool = require('../config/db');

// GET /api/notifications?unread=true&limit=20
async function getNotifications(req, res) {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const unreadOnly = req.query.unread === 'true';
    const [rows] = await pool.query(
      `SELECT id, type, title, message, link, is_read, created_at
       FROM notifications
       WHERE user_id = ? ${unreadOnly ? 'AND is_read = 0' : ''}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [req.user.id, limit]
    );
    const [[{ unread }]] = await pool.query(
      'SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]
    );
    res.json({ rows, unread });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

// GET /api/notifications/count  (cheap call used by the bell every minute)
async function getUnreadCount(req, res) {
  try {
    const [[{ unread }]] = await pool.query(
      'SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]
    );
    res.json({ unread });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

// PATCH /api/notifications/:id/read
async function markRead(req, res) {
  try {
    await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

// POST /api/notifications/read-all
async function markAllRead(req, res) {
  try {
    await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [req.user.id]);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

// DELETE /api/notifications/read  (clears notifications already read)
async function clearRead(req, res) {
  try {
    await pool.query('DELETE FROM notifications WHERE user_id = ? AND is_read = 1', [req.user.id]);
    res.json({ message: 'Read notifications cleared' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { getNotifications, getUnreadCount, markRead, markAllRead, clearRead };
