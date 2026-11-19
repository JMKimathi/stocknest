const express = require('express');
const router = express.Router();
const { getProfile, updateProfile, changePassword, updateAvatar } = require('../controllers/profileController');
const protect = require('../middleware/authMiddleware');

// Every logged-in user (admin or staff) manages their own profile here
router.use(protect);

router.get('/', getProfile);
router.put('/', updateProfile);
router.put('/password', changePassword);
router.put('/avatar', updateAvatar);

module.exports = router;
