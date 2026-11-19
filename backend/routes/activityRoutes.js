const express = require('express');
const router = express.Router();
const { getActivity } = require('../controllers/activityController');
const protect = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/roleMiddleware');

router.use(protect, adminOnly);
router.get('/', getActivity);

module.exports = router;
