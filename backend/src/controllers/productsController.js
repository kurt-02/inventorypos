const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');

/** GET /api/products - everyone authenticated (cashiers need this for the POS grid) */
const getProducts = asyncHandler(async (req, res) => {
  const includeInactive = req.query.include_inactive === 'true' && req.user.role === 'admin';
  const [rows] = await pool.query(
    `SELECT * FROM products ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY category, name`
  );
  res.json({ products: rows });
});

/** POST /api/products - admin only */
const createProduct = asyncHandler(async (req, res) => {
  const { name, price, category } = req.body;
  if (!name || price == null || Number(price) < 0) {
    throw new ApiError(400, 'name and a non-negative price are required.');
  }
  const [result] = await pool.query(
    'INSERT INTO products (name, price, category, is_active) VALUES (?, ?, ?, 1)',
    [name, price, category || 'General']
  );
  res.status(201).json({ id: result.insertId, name, price, category: category || 'General', is_active: 1 });
});

/** PUT /api/products/:id - admin only */
const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, price, category, is_active } = req.body;

  const [existing] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
  if (existing.length === 0) throw new ApiError(404, 'Product not found.');

  await pool.query(
    `UPDATE products SET name = ?, price = ?, category = ?, is_active = ? WHERE id = ?`,
    [
      name ?? existing[0].name,
      price ?? existing[0].price,
      category ?? existing[0].category,
      is_active ?? existing[0].is_active,
      id,
    ]
  );
  const [[updated]] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
  res.json(updated);
});

/** DELETE /api/products/:id - admin only. Soft delete (is_active = 0) to preserve sales history. */
const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [result] = await pool.query('UPDATE products SET is_active = 0 WHERE id = ?', [id]);
  if (result.affectedRows === 0) throw new ApiError(404, 'Product not found.');
  res.json({ message: 'Product deactivated.' });
});

module.exports = { getProducts, createProduct, updateProduct, deleteProduct };
