const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { getRecipes, createRecipe, updateRecipe, deleteRecipe } = require('../controllers/recipesController');

const router = express.Router();

router.use(authenticate, requireRole('admin'));

router.get('/', getRecipes);
router.post('/', createRecipe);
router.put('/:id', updateRecipe);
router.delete('/:id', deleteRecipe);

module.exports = router;
