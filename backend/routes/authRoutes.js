const express = require('express');
const router = express.Router();
const {
  getStatus, setupOwner, register, login, forgotPassword, getMe
} = require('../controllers/authController');
const protect = require('../middleware/authMiddleware');

// Public: used by the welcome, sign-in, sign-up and setup pages
router.get('/status', getStatus);
router.post('/setup', setupOwner);
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);

router.get('/me', protect, getMe);

module.exports = router;
