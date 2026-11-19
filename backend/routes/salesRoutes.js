const express = require('express');
const router = express.Router();
const { createSale, getSales, getSaleById, voidSale } = require('../controllers/salesController');
const protect = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/roleMiddleware');

router.use(protect);

// Admin and staff can both make sales and see receipts
router.get('/', getSales);
router.get('/:id', getSaleById);
router.post('/', createSale);

// Only an admin can void (cancel) a completed sale
router.post('/:id/void', adminOnly, voidSale);

module.exports = router;
