const express = require('express');
const router = express.Router();
const {
  getCategories, createCategory, updateCategory, deleteCategory
} = require('../controllers/categoryController');
const protect = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/roleMiddleware');

router.use(protect); // any logged-in user can view

router.get('/', getCategories);
router.post('/', adminOnly, createCategory);
router.put('/:id', adminOnly, updateCategory);
router.delete('/:id', adminOnly, deleteCategory);

module.exports = router;
