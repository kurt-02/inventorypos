const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');
const { parsePagination, buildPageMeta } = require('../utils/pagination');

const MANUAL_REASONS = ['waste', 'restock', 'correction'];

/** GET /api/inventory/:branch_id - cashier (own branch) or admin (any branch) */
const getBranchInventory = asyncHandler(async (req, res) => {
  const { branch_id } = req.params;
  const [rows] = await pool.query(
    `SELECT inv.id, inv.ingredient_id, ing.name AS ingredient_name, ing.unit, ing.category,
            ing.low_stock_threshold, inv.quantity, inv.quantity <= ing.low_stock_threshold AS is_low,
            inv.last_counted_at, u.full_name AS last_counted_by_name
     FROM inventory inv
     JOIN ingredients ing ON ing.id = inv.ingredient_id
     LEFT JOIN users u ON u.id = inv.last_counted_by
     WHERE inv.branch_id = ?
     ORDER BY ing.category, ing.name`,
    [branch_id]
  );
  res.json({ branch_id: Number(branch_id), inventory: rows.map((r) => ({ ...r, is_low: !!r.is_low })) });
});

/** GET /api/inventory - admin only, both branches side by side */
const getAllInventory = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT inv.id, inv.branch_id, b.name AS branch_name, inv.ingredient_id,
            ing.name AS ingredient_name, ing.unit, ing.category, ing.low_stock_threshold,
            inv.quantity, inv.quantity <= ing.low_stock_threshold AS is_low,
            inv.last_counted_at, u.full_name AS last_counted_by_name
     FROM inventory inv
     JOIN branches b ON b.id = inv.branch_id
     JOIN ingredients ing ON ing.id = inv.ingredient_id
     LEFT JOIN users u ON u.id = inv.last_counted_by
     ORDER BY b.name, ing.category, ing.name`
  );
  res.json({ inventory: rows.map((r) => ({ ...r, is_low: !!r.is_low })) });
});

/**
 * PUT /api/inventory/check - cashier confirms/updates counts at end of shift.
 * Body: { branch_id, counts: [{ ingredient_id, counted_quantity }] }
 * Any difference from the current recorded quantity is logged as a
 * 'shift_count' adjustment so admins can see what changed and by how much.
 */
const checkInventory = asyncHandler(async (req, res) => {
  const { branch_id, counts } = req.body;
  if (!branch_id || !Array.isArray(counts) || counts.length === 0) {
    throw new ApiError(400, 'branch_id and a non-empty counts array are required.');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    for (const { ingredient_id, counted_quantity } of counts) {
      if (!ingredient_id || counted_quantity == null || counted_quantity < 0) {
        throw new ApiError(400, 'Each count needs ingredient_id and a non-negative counted_quantity.');
      }

      const [[current]] = await connection.query(
        'SELECT quantity FROM inventory WHERE branch_id = ? AND ingredient_id = ? FOR UPDATE',
        [branch_id, ingredient_id]
      );
      if (!current) {
        throw new ApiError(400, `No inventory record for ingredient ${ingredient_id} at branch ${branch_id}.`);
      }

      const diff = counted_quantity - current.quantity;

      await connection.query(
        'UPDATE inventory SET quantity = ?, last_counted_at = NOW(), last_counted_by = ? WHERE branch_id = ? AND ingredient_id = ?',
        [counted_quantity, req.user.id, branch_id, ingredient_id]
      );

      if (diff !== 0) {
        await connection.query(
          `INSERT INTO inventory_adjustments (branch_id, ingredient_id, quantity_change, reason, adjusted_by, notes)
           VALUES (?, ?, ?, 'shift_count', ?, 'End-of-shift count')`,
          [branch_id, ingredient_id, diff, req.user.id]
        );
      }
    }

    await connection.commit();
    res.json({ message: 'Inventory counts updated.' });
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
});

/**
 * PUT /api/inventory/adjust - admin manual adjustment with reason logging.
 * Body: { branch_id, ingredient_id, quantity_change, reason, notes? }
 * reason must be one of: waste, restock, correction (sale/shift_count are
 * reserved for the automatic flows above).
 */
const adjustInventory = asyncHandler(async (req, res) => {
  const { branch_id, ingredient_id, quantity_change, reason, notes } = req.body;

  if (!branch_id || !ingredient_id || quantity_change == null || !reason) {
    throw new ApiError(400, 'branch_id, ingredient_id, quantity_change and reason are required.');
  }
  if (!MANUAL_REASONS.includes(reason)) {
    throw new ApiError(400, `reason must be one of: ${MANUAL_REASONS.join(', ')}.`);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [[current]] = await connection.query(
      'SELECT quantity FROM inventory WHERE branch_id = ? AND ingredient_id = ? FOR UPDATE',
      [branch_id, ingredient_id]
    );
    if (!current) {
      throw new ApiError(400, 'No inventory record found for that branch/ingredient.');
    }

    const newQuantity = Number(current.quantity) + Number(quantity_change);
    if (newQuantity < 0) {
      throw new ApiError(400, 'Adjustment would result in negative stock.');
    }

    await connection.query(
      'UPDATE inventory SET quantity = ? WHERE branch_id = ? AND ingredient_id = ?',
      [newQuantity, branch_id, ingredient_id]
    );
    await connection.query(
      `INSERT INTO inventory_adjustments (branch_id, ingredient_id, quantity_change, reason, adjusted_by, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [branch_id, ingredient_id, quantity_change, reason, req.user.id, notes || null]
    );

    await connection.commit();
    res.json({ message: 'Inventory adjusted.', new_quantity: newQuantity });
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
});

const ADJUSTMENT_COLUMNS = `
  ia.id, ia.branch_id, b.name AS branch_name, ia.ingredient_id, ing.name AS ingredient_name,
  ing.unit, ia.quantity_change, ia.reason, ia.sale_id, ia.notes, ia.adjusted_at,
  u.full_name AS adjusted_by_name`;

const ADJUSTMENT_JOINS = `
  FROM inventory_adjustments ia
  JOIN branches b ON b.id = ia.branch_id
  JOIN ingredients ing ON ing.id = ia.ingredient_id
  LEFT JOIN users u ON u.id = ia.adjusted_by`;

/**
 * GET /api/inventory/adjustments - admin, full audit history with filters.
 *
 * Sale-driven rows carry a sale_id so the client can group every ingredient
 * one checkout consumed under that checkout. The products of those sales are
 * returned alongside, so the history can name what was actually bought instead
 * of only listing the ingredients it burned through.
 */
const getAdjustmentHistory = asyncHandler(async (req, res) => {
  const { branch_id, ingredient_id, reason } = req.query;
  const { page, limit, offset } = parsePagination(req.query);

  const clauses = [];
  const params = [];
  if (branch_id) { clauses.push('ia.branch_id = ?'); params.push(branch_id); }
  if (ingredient_id) { clauses.push('ia.ingredient_id = ?'); params.push(ingredient_id); }
  if (reason) { clauses.push('ia.reason = ?'); params.push(reason); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  // Counted against the same filters so the client knows how deep the history
  // goes without fetching it. Cheap: it reads an index, not the rows.
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM inventory_adjustments ia ${where}`,
    params
  );

  // Deferred join: the inner query picks this page's ids using only
  // inventory_adjustments, where idx_adjustments_recent satisfies the ORDER BY
  // outright. Joining branches/ingredients/users in the same statement made the
  // optimizer abandon that index and fall back to scanning every row into a
  // temporary table, so the joins are applied afterwards to 25 rows instead.
  const [rows] = await pool.query(
    `SELECT ${ADJUSTMENT_COLUMNS}
     FROM (
       SELECT ia.id FROM inventory_adjustments ia
       ${where}
       ORDER BY ia.adjusted_at DESC, ia.id DESC
       LIMIT ? OFFSET ?
     ) AS page
     JOIN inventory_adjustments ia ON ia.id = page.id
     JOIN branches b ON b.id = ia.branch_id
     JOIN ingredients ing ON ing.id = ia.ingredient_id
     LEFT JOIN users u ON u.id = ia.adjusted_by
     ORDER BY ia.adjusted_at DESC, ia.id DESC`,
    [...params, limit, offset]
  );

  const saleIds = [...new Set(rows.map((r) => r.sale_id).filter(Boolean))];

  // The LIMIT can slice through the middle of a sale, which would show a
  // checkout as having consumed fewer ingredients than it really did. Pull the
  // missing siblings back in so every group displayed is complete. Skipped when
  // filtering by ingredient, where showing only that ingredient is the point.
  if (saleIds.length > 0 && !ingredient_id) {
    const seen = new Set(rows.map((r) => r.id));
    const [siblings] = await pool.query(
      `SELECT ${ADJUSTMENT_COLUMNS} ${ADJUSTMENT_JOINS}
       WHERE ia.sale_id IN (?) AND ia.id NOT IN (?)
       ORDER BY ia.adjusted_at DESC, ia.id DESC`,
      [saleIds, [...seen]]
    );
    rows.push(...siblings);
    rows.sort((a, b) => new Date(b.adjusted_at) - new Date(a.adjusted_at) || b.id - a.id);
  }

  let sales = [];
  if (saleIds.length > 0) {
    const [saleRows] = await pool.query(
      `SELECT s.id, s.total_amount, s.created_at,
              si.product_id, p.name AS product_name, si.quantity, si.price_at_sale
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
       JOIN products p ON p.id = si.product_id
       WHERE s.id IN (?)
       ORDER BY s.id DESC, si.id ASC`,
      [saleIds]
    );

    const bySale = new Map();
    for (const row of saleRows) {
      if (!bySale.has(row.id)) {
        bySale.set(row.id, {
          id: row.id,
          total_amount: row.total_amount,
          created_at: row.created_at,
          products: [],
        });
      }
      bySale.get(row.id).products.push({
        product_id: row.product_id,
        name: row.product_name,
        quantity: row.quantity,
        price_at_sale: row.price_at_sale,
      });
    }
    sales = [...bySale.values()];
  }

  res.json({
    adjustments: rows,
    sales,
    page: buildPageMeta({ page, limit, total }),
  });
});

module.exports = { getBranchInventory, getAllInventory, checkInventory, adjustInventory, getAdjustmentHistory };
