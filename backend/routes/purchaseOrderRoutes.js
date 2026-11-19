const express = require('express');
const router = express.Router();
const {
  getPurchaseOrders, getPurchaseOrderById, createPurchaseOrder, updatePurchaseOrder,
  placeOrder, receiveItems, cancelPurchaseOrder, deletePurchaseOrder
} = require('../controllers/purchaseOrderController');
const protect = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/roleMiddleware');

router.use(protect);

// Day-to-day work: admin and staff can draft, place and receive orders
router.get('/', getPurchaseOrders);
router.get('/:id', getPurchaseOrderById);
router.post('/', createPurchaseOrder);
router.put('/:id', updatePurchaseOrder);
router.post('/:id/order', placeOrder);
router.post('/:id/receive', receiveItems);
router.delete('/:id', deletePurchaseOrder);

// Cancelling a placed order is an admin decision
router.post('/:id/cancel', adminOnly, cancelPurchaseOrder);

module.exports = router;
