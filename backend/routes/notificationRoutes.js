const express = require('express');
const router = express.Router();
const {
  getNotifications, getUnreadCount, markRead, markAllRead, clearRead
} = require('../controllers/notificationController');
const protect = require('../middleware/authMiddleware');

// Everyone only ever sees their own notifications
router.use(protect);

router.get('/', getNotifications);
router.get('/count', getUnreadCount);
router.post('/read-all', markAllRead);
router.delete('/read', clearRead);
router.patch('/:id/read', markRead);

module.exports = router;
