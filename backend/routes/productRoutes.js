const express = require('express');
const router = express.Router();
const {
  getProducts, getProductById, getProductImage, createProduct, updateProduct, deleteProduct, restoreProduct,
  adjustStock, getProductHistory, getDashboardSummary, importProducts
} = require('../controllers/productController');
const protect = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/roleMiddleware');

// Product pictures are public so they can be used directly in <img> tags
router.get('/:id/image', getProductImage);

router.use(protect); // everything below requires login

router.get('/summary/dashboard', getDashboardSummary);
router.get('/', getProducts);
router.get('/:id', getProductById);
router.get('/:id/history', getProductHistory);

// Staff and admin can both add products and adjust stock (day-to-day work)
router.post('/', createProduct);
router.post('/:id/stock', adjustStock);
router.put('/:id', updateProduct);

// Admin only: bulk import, archive/delete and restore
router.post('/import', adminOnly, importProducts);
router.delete('/:id', adminOnly, deleteProduct);
router.patch('/:id/restore', adminOnly, restoreProduct);

module.exports = router;
