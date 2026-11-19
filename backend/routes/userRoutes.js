const express = require('express');
const router = express.Router();
const {
  getUsers, createUser, updateUser, deleteUser, approveUser, resetUserPassword
} = require('../controllers/userController');
const protect = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/roleMiddleware');

// All user-management routes: logged in AND admin
router.use(protect, adminOnly);

router.get('/', getUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);
router.post('/:id/approve', approveUser);
router.post('/:id/reset-password', resetUserPassword);

module.exports = router;
