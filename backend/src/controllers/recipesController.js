const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');

// ---------------------------------------------------------------------------
// Ingredients (raw stock items). Not in the original endpoint list but the
// Recipe Manager admin page needs to create/edit them, so they live here
// alongside product_recipes under a small /api/ingredients router.
// ---------------------------------------------------------------------------

const getIngredients = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM ingredients ORDER BY category, name');
  res.json({ ingredients: rows });
});

/** Creating an ingredient also seeds a zero-quantity inventory row for every
 * existing branch, so it immediately shows up on both branches' inventory
 * screens instead of silently missing until someone restocks it. */
const createIngredient = asyncHandler(async (req, res) => {
  const { name, unit, category, low_stock_threshold } = req.body;
  if (!name || !unit) throw new ApiError(400, 'name and unit are required.');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      'INSERT INTO ingredients (name, unit, category, low_stock_threshold) VALUES (?, ?, ?, ?)',
      [name, unit, category || 'General', low_stock_threshold || 0]
    );
    const ingredientId = result.insertId;

    const [branches] = await connection.query('SELECT id FROM branches');
    for (const branch of branches) {
      await connection.query(
        'INSERT INTO inventory (branch_id, ingredient_id, quantity) VALUES (?, ?, 0)',
        [branch.id, ingredientId]
      );
    }

    await connection.commit();
    res.status(201).json({
      id: ingredientId,
      name,
      unit,
      category: category || 'General',
      low_stock_threshold: low_stock_threshold || 0,
    });
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
});

const updateIngredient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, unit, category, low_stock_threshold } = req.body;
  const [existing] = await pool.query('SELECT * FROM ingredients WHERE id = ?', [id]);
  if (existing.length === 0) throw new ApiError(404, 'Ingredient not found.');

  await pool.query(
    'UPDATE ingredients SET name = ?, unit = ?, category = ?, low_stock_threshold = ? WHERE id = ?',
    [
      name ?? existing[0].name,
      unit ?? existing[0].unit,
      category ?? existing[0].category,
      low_stock_threshold ?? existing[0].low_stock_threshold,
      id,
    ]
  );
  const [[updated]] = await pool.query('SELECT * FROM ingredients WHERE id = ?', [id]);
  res.json(updated);
});

/** Hard delete - cascades to product_recipes and inventory rows referencing it. */
const deleteIngredient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [result] = await pool.query('DELETE FROM ingredients WHERE id = ?', [id]);
  if (result.affectedRows === 0) throw new ApiError(404, 'Ingredient not found.');
  res.json({ message: 'Ingredient deleted.' });
});

// ---------------------------------------------------------------------------
// Product recipes: which ingredients (and how much of each) a product uses
// ---------------------------------------------------------------------------

/** GET /api/recipes?product_id= - admin only */
const getRecipes = asyncHandler(async (req, res) => {
  const { product_id } = req.query;
  const where = product_id ? 'WHERE pr.product_id = ?' : '';
  const params = product_id ? [product_id] : [];

  const [rows] = await pool.query(
    `SELECT pr.id, pr.product_id, p.name AS product_name, pr.ingredient_id,
            ing.name AS ingredient_name, pr.quantity, pr.unit
     FROM product_recipes pr
     JOIN products p ON p.id = pr.product_id
     JOIN ingredients ing ON ing.id = pr.ingredient_id
     ${where}
     ORDER BY p.name, ing.name`,
    params
  );
  res.json({ recipes: rows });
});

/** POST /api/recipes - admin only */
const createRecipe = asyncHandler(async (req, res) => {
  const { product_id, ingredient_id, quantity, unit } = req.body;
  if (!product_id || !ingredient_id || quantity == null || !unit) {
    throw new ApiError(400, 'product_id, ingredient_id, quantity and unit are required.');
  }
  const [result] = await pool.query(
    'INSERT INTO product_recipes (product_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)',
    [product_id, ingredient_id, quantity, unit]
  );
  res.status(201).json({ id: result.insertId, product_id, ingredient_id, quantity, unit });
});

/** PUT /api/recipes/:id - admin only */
const updateRecipe = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { quantity, unit } = req.body;
  const [existing] = await pool.query('SELECT * FROM product_recipes WHERE id = ?', [id]);
  if (existing.length === 0) throw new ApiError(404, 'Recipe entry not found.');

  await pool.query('UPDATE product_recipes SET quantity = ?, unit = ? WHERE id = ?', [
    quantity ?? existing[0].quantity,
    unit ?? existing[0].unit,
    id,
  ]);
  const [[updated]] = await pool.query('SELECT * FROM product_recipes WHERE id = ?', [id]);
  res.json(updated);
});

/** DELETE /api/recipes/:id - admin only */
const deleteRecipe = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [result] = await pool.query('DELETE FROM product_recipes WHERE id = ?', [id]);
  if (result.affectedRows === 0) throw new ApiError(404, 'Recipe entry not found.');
  res.json({ message: 'Recipe entry deleted.' });
});

module.exports = {
  getIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient,
  getRecipes,
  createRecipe,
  updateRecipe,
  deleteRecipe,
};
