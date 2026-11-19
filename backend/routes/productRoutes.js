const express = require('express');
const router = express.Router();
const {
  getProducts, getProductById, createProduct, updateProduct, deleteProduct,
  adjustStock, getProductHistory, getDashboardSummary
} = require('../controllers/productController');
const protect = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/roleMiddleware');

router.use(protect); // all product routes require login

router.get('/summary/dashboard', getDashboardSummary);
router.get('/', getProducts);
router.get('/:id', getProductById);
router.get('/:id/history', getProductHistory);

// Staff and admin can both add products and adjust stock (day-to-day work)
router.post('/', createProduct);
router.post('/:id/stock', adjustStock);
router.put('/:id', updateProduct);

// Only admin can permanently delete a product
router.delete('/:id', adminOnly, deleteProduct);

module.exports = router;
