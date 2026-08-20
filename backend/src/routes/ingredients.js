const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const {
  getIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient,
} = require('../controllers/recipesController');

const router = express.Router();

router.use(authenticate);

// Cashiers read ingredient names/units on the inventory screens.
router.get('/', getIngredients);

router.post('/', requireRole('admin'), createIngredient);
router.put('/:id', requireRole('admin'), updateIngredient);
router.delete('/:id', requireRole('admin'), deleteIngredient);

module.exports = router;
