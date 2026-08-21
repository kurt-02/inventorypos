const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');
const { PAYMENT_METHOD_VALUES } = require('../constants/paymentMethods');
const { parsePagination, buildPageMeta } = require('../utils/pagination');

/**
 * POST /api/sales
 * Rings up a sale: creates the sales + sale_items rows, then auto-deducts
 * every ingredient used by the recipes of the purchased products from that
 * branch's inventory. Runs inside a transaction with row locks so concurrent
 * checkouts at the same branch can't oversell shared stock.
 *
 * Body: { branch_id, payment_method, items: [{ product_id, quantity }] }
 */
const createSale = asyncHandler(async (req, res) => {
  const { branch_id, items, payment_method } = req.body;

  if (!branch_id || !Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, 'branch_id and a non-empty items array are required.');
  }
  for (const item of items) {
    if (!item.product_id || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new ApiError(400, 'Each item needs a product_id and a positive integer quantity.');
    }
  }
  // The route validator already rejects a bad payment_method; re-checking here
  // keeps the rule attached to the write itself, so any future caller that
  // reaches this controller by another path still can't store a junk value.
  if (!PAYMENT_METHOD_VALUES.includes(payment_method)) {
    throw new ApiError(400, `Payment method must be one of: ${PAYMENT_METHOD_VALUES.join(', ')}.`);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Look up current prices server-side (never trust client-sent prices).
    const productIds = items.map((i) => i.product_id);
    const [products] = await connection.query(
      `SELECT id, name, price FROM products WHERE id IN (?) AND is_active = 1`,
      [productIds]
    );
    const productMap = new Map(products.map((p) => [p.id, p]));
    for (const item of items) {
      if (!productMap.has(item.product_id)) {
        throw new ApiError(400, `Product ${item.product_id} is not available.`);
      }
    }

    const totalAmount = items.reduce(
      (sum, item) => sum + productMap.get(item.product_id).price * item.quantity,
      0
    );

    const [saleResult] = await connection.query(
      'INSERT INTO sales (branch_id, cashier_id, total_amount, payment_method) VALUES (?, ?, ?, ?)',
      [branch_id, req.user.id, totalAmount, payment_method]
    );
    const saleId = saleResult.insertId;

    for (const item of items) {
      const product = productMap.get(item.product_id);
      await connection.query(
        'INSERT INTO sale_items (sale_id, product_id, quantity, price_at_sale) VALUES (?, ?, ?, ?)',
        [saleId, item.product_id, item.quantity, product.price]
      );
    }

    // Aggregate total ingredient usage across the whole sale.
    const [recipeRows] = await connection.query(
      `SELECT product_id, ingredient_id, quantity FROM product_recipes WHERE product_id IN (?)`,
      [productIds]
    );
    const usage = new Map(); // ingredient_id -> total quantity needed
    for (const item of items) {
      for (const recipe of recipeRows.filter((r) => r.product_id === item.product_id)) {
        const needed = recipe.quantity * item.quantity;
        usage.set(recipe.ingredient_id, (usage.get(recipe.ingredient_id) || 0) + needed);
      }
    }

    if (usage.size > 0) {
      const ingredientIds = [...usage.keys()];
      // Lock the rows we're about to deduct from so two simultaneous sales
      // can't both read the same stale quantity.
      const [stockRows] = await connection.query(
        `SELECT ingredient_id, quantity FROM inventory
         WHERE branch_id = ? AND ingredient_id IN (?) FOR UPDATE`,
        [branch_id, ingredientIds]
      );
      const stockMap = new Map(stockRows.map((r) => [r.ingredient_id, r.quantity]));

      for (const [ingredientId, needed] of usage) {
        const available = stockMap.get(ingredientId) ?? 0;
        if (available < needed) {
          throw new ApiError(
            409,
            `Insufficient stock for ingredient #${ingredientId} at this branch (need ${needed}, have ${available}).`
          );
        }
      }

      for (const [ingredientId, needed] of usage) {
        await connection.query(
          'UPDATE inventory SET quantity = quantity - ? WHERE branch_id = ? AND ingredient_id = ?',
          [needed, branch_id, ingredientId]
        );
        await connection.query(
          `INSERT INTO inventory_adjustments (branch_id, ingredient_id, quantity_change, reason, sale_id, adjusted_by, notes)
           VALUES (?, ?, ?, 'sale', ?, ?, ?)`,
          [branch_id, ingredientId, -needed, saleId, req.user.id, `Auto-deducted for sale #${saleId}`]
        );
      }
    }

    await connection.commit();

    res.status(201).json({
      id: saleId,
      branch_id,
      cashier_id: req.user.id,
      total_amount: totalAmount,
      payment_method,
      items: items.map((i) => ({
        product_id: i.product_id,
        name: productMap.get(i.product_id).name,
        quantity: i.quantity,
        price_at_sale: productMap.get(i.product_id).price,
      })),
    });
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
});

/**
 * GET /api/sales/today/:branch_id - cashier's own branch, current day only.
 *
 * Query: page, limit
 *
 * The day's totals are aggregated in SQL over every sale, while only the
 * requested page of transactions is returned. A busy branch can ring up
 * hundreds of sales in a shift, so the list itself has to be paged even though
 * it is scoped to a single day.
 */
const getTodaySales = asyncHandler(async (req, res) => {
  const { branch_id } = req.params;
  const { page, limit, offset } = parsePagination(req.query);

  // Compared as a half-open range rather than DATE(created_at) = CURDATE():
  // wrapping the column in a function makes the filter non-sargable, so MySQL
  // cannot use idx_sales_branch_created and scans every row for the branch.
  const dayFilter = 's.branch_id = ? AND s.created_at >= CURDATE() AND s.created_at < CURDATE() + INTERVAL 1 DAY';

  // One row per payment method - the day's figures without reading the sales.
  const [totals] = await pool.query(
    `SELECT s.payment_method, COUNT(*) AS count, COALESCE(SUM(s.total_amount), 0) AS total,
            COALESCE(SUM(s.item_count), 0) AS items
     FROM (
       SELECT s.id, s.payment_method, s.total_amount,
              (SELECT COALESCE(SUM(si.quantity), 0) FROM sale_items si WHERE si.sale_id = s.id) AS item_count
       FROM sales s WHERE ${dayFilter}
     ) s
     GROUP BY s.payment_method`,
    [branch_id]
  );

  const byPaymentMethod = {};
  for (const value of PAYMENT_METHOD_VALUES) byPaymentMethod[value] = { count: 0, total: 0 };
  let count = 0;
  let totalRevenue = 0;
  let itemsSold = 0;
  for (const row of totals) {
    const bucket = byPaymentMethod[row.payment_method];
    if (bucket) {
      bucket.count = Number(row.count);
      bucket.total = Number(row.total);
    }
    count += Number(row.count);
    totalRevenue += Number(row.total);
    itemsSold += Number(row.items);
  }

  const [sales] = await pool.query(
    `SELECT s.id, s.total_amount, s.payment_method, s.created_at, u.full_name AS cashier_name
     FROM sales s
     JOIN users u ON u.id = s.cashier_id
     WHERE ${dayFilter}
     ORDER BY s.created_at DESC, s.id DESC
     LIMIT ? OFFSET ?`,
    [branch_id, limit, offset]
  );

  // Line items are fetched only for the sales on this page.
  if (sales.length > 0) {
    const saleIds = sales.map((s) => s.id);
    const [items] = await pool.query(
      `SELECT si.sale_id, si.product_id, p.name, si.quantity, si.price_at_sale
       FROM sale_items si
       JOIN products p ON p.id = si.product_id
       WHERE si.sale_id IN (?)
       ORDER BY si.id`,
      [saleIds]
    );
    const itemsBySale = new Map();
    for (const item of items) {
      if (!itemsBySale.has(item.sale_id)) itemsBySale.set(item.sale_id, []);
      itemsBySale.get(item.sale_id).push(item);
    }
    for (const sale of sales) {
      sale.items = itemsBySale.get(sale.id) || [];
    }
  }

  res.json({
    sales,
    summary: {
      count,
      total_revenue: totalRevenue,
      items_sold: itemsSold,
      // Lets a cashier reconcile the drawer against digital takings at shift end.
      by_payment_method: byPaymentMethod,
    },
    page: buildPageMeta({ page, limit, total: count }),
  });
});

module.exports = { createSale, getTodaySales };
