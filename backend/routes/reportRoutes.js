const express = require('express');
const router = express.Router();
const { getOverview, exportCsv } = require('../controllers/reportController');
const protect = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/roleMiddleware');

// Business figures (revenue, profit) are for admins only
router.use(protect, adminOnly);

router.get('/overview', getOverview);
router.get('/export/:type', exportCsv);

module.exports = router;
