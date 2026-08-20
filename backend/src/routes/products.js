const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { getProducts, createProduct, updateProduct, deleteProduct } = require('../controllers/productsController');

const router = express.Router();

router.use(authenticate);

// Any logged-in user can read the catalog (cashiers need it for the POS grid).
router.get('/', getProducts);

// Only admins can manage the catalog.
router.post('/', requireRole('admin'), createProduct);
router.put('/:id', requireRole('admin'), updateProduct);
router.delete('/:id', requireRole('admin'), deleteProduct);

module.exports = router;
