const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { PAYMENT_METHOD_VALUES } = require('../constants/paymentMethods');
const { parsePagination, buildPageMeta } = require('../utils/pagination');

/**
 * Formats a Date as a local-time YYYY-MM-DD string. Deliberately not
 * toISOString(), which converts to UTC and would shift "today" by a day for
 * anyone east or west of Greenwich.
 */
function localDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Builds a `created_at BETWEEN ? AND ?` clause from optional start_date/end_date
 * query params (YYYY-MM-DD). Defaults to the last 30 days if neither is given,
 * so reports don't accidentally scan the entire sales table by default.
 */
function dateRange(query) {
  const endDate = query.end_date || localDate(new Date());

  let startDate = query.start_date;
  if (!startDate) {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    startDate = localDate(d);
  }

  return { start: `${startDate} 00:00:00`, end: `${endDate} 23:59:59` };
}

/**
 * GET /api/reports/sales - admin, paged sales history.
 *
 * Query: branch_id, payment_method, search, start_date, end_date, page, limit
 *
 * Two queries run per request, both constrained by the same WHERE clause:
 * one GROUP BY that totals the entire matching set inside the database, and one
 * that fetches just the rows on the requested page. The totals therefore stay
 * correct across the whole range while the response carries only `limit` rows -
 * returning every row so the client could sum them is what made this endpoint
 * grow without bound.
 */
const getSalesReport = asyncHandler(async (req, res) => {
  const { branch_id, payment_method, search } = req.query;
  const { start, end } = dateRange(req.query);
  const { page, limit, offset } = parsePagination(req.query);

  const clauses = ['s.created_at BETWEEN ? AND ?'];
  const params = [start, end];

  if (branch_id) {
    clauses.push('s.branch_id = ?');
    params.push(branch_id);
  }
  // Guarded against the list so an arbitrary string can't reach the query.
  if (payment_method && PAYMENT_METHOD_VALUES.includes(payment_method)) {
    clauses.push('s.payment_method = ?');
    params.push(payment_method);
  }

  const term = (search || '').trim();
  if (term) {
    // Matches a sale number directly, or any sale containing a product whose
    // name matches. Resolved in the database so the client never downloads
    // rows only to discard them.
    const saleId = Number.parseInt(term, 10);
    clauses.push(`(
      ${Number.isFinite(saleId) ? 's.id = ? OR' : ''}
      s.id IN (
        SELECT si.sale_id FROM sale_items si
        JOIN products p ON p.id = si.product_id
        WHERE p.name LIKE ?
      )
    )`);
    if (Number.isFinite(saleId)) params.push(saleId);
    params.push(`%${term}%`);
  }

  const where = `WHERE ${clauses.join(' AND ')}`;

  // Totals for the whole filtered set. At most one row per payment method, so
  // the overall figures are derived from a handful of rows rather than every
  // sale in the range.
  const [totals] = await pool.query(
    `SELECT s.payment_method, COUNT(*) AS count, COALESCE(SUM(s.total_amount), 0) AS total
     FROM sales s ${where}
     GROUP BY s.payment_method`,
    params
  );

  const byPaymentMethod = {};
  for (const value of PAYMENT_METHOD_VALUES) byPaymentMethod[value] = { count: 0, total: 0 };
  let count = 0;
  let totalRevenue = 0;
  for (const row of totals) {
    const bucket = byPaymentMethod[row.payment_method];
    if (bucket) {
      bucket.count = Number(row.count);
      bucket.total = Number(row.total);
    }
    count += Number(row.count);
    totalRevenue += Number(row.total);
  }

  // Deferred join, for the same reason as the adjustment history: selecting the
  // page's ids from `sales` alone lets idx_sales_created_at serve the ORDER BY,
  // whereas joining branches/users in one statement pushed the optimizer into a
  // temporary table plus filesort across the whole date range. Only the columns
  // the table actually renders are selected - branch_id/cashier_id were being
  // sent and never used.
  const [sales] = await pool.query(
    `SELECT s.id, b.name AS branch_name, u.full_name AS cashier_name,
            s.total_amount, s.payment_method, s.created_at
     FROM (
       SELECT s.id FROM sales s
       ${where}
       ORDER BY s.created_at DESC, s.id DESC
       LIMIT ? OFFSET ?
     ) AS page
     JOIN sales s ON s.id = page.id
     JOIN branches b ON b.id = s.branch_id
     JOIN users u ON u.id = s.cashier_id
     ORDER BY s.created_at DESC, s.id DESC`,
    [...params, limit, offset]
  );

  res.json({
    sales,
    summary: {
      count,
      total_revenue: totalRevenue,
      average_sale: count > 0 ? totalRevenue / count : 0,
      by_payment_method: byPaymentMethod,
      range: { start, end },
    },
    page: buildPageMeta({ page, limit, total: count }),
  });
});

/** GET /api/reports/comparison?start_date=&end_date= - Branch A vs Branch B */
const getComparisonReport = asyncHandler(async (req, res) => {
  const { start, end } = dateRange(req.query);

  const [branches] = await pool.query('SELECT id, name FROM branches ORDER BY id');

  // Revenue and item counts are queried separately on purpose: joining
  // sale_items into the revenue query would repeat each sale's total_amount
  // once per line item and inflate SUM(total_amount).
  const [salesStats] = await pool.query(
    `SELECT s.branch_id,
            COUNT(*) AS transaction_count,
            COALESCE(SUM(s.total_amount), 0) AS total_revenue
     FROM sales s
     WHERE s.created_at BETWEEN ? AND ?
     GROUP BY s.branch_id`,
    [start, end]
  );
  const salesByBranch = new Map(salesStats.map((r) => [r.branch_id, r]));

  const [itemStats] = await pool.query(
    `SELECT s.branch_id, COALESCE(SUM(si.quantity), 0) AS items_sold
     FROM sales s
     JOIN sale_items si ON si.sale_id = s.id
     WHERE s.created_at BETWEEN ? AND ?
     GROUP BY s.branch_id`,
    [start, end]
  );
  const itemsByBranch = new Map(itemStats.map((r) => [r.branch_id, Number(r.items_sold)]));

  const [inventoryStats] = await pool.query(
    `SELECT inv.branch_id,
            COUNT(*) AS ingredient_count,
            SUM(CASE WHEN inv.quantity > ing.low_stock_threshold THEN 1 ELSE 0 END) AS healthy_count
     FROM inventory inv
     JOIN ingredients ing ON ing.id = inv.ingredient_id
     GROUP BY inv.branch_id`
  );
  const inventoryByBranch = new Map(inventoryStats.map((r) => [r.branch_id, r]));

  const comparison = branches.map((branch) => {
    const sales = salesByBranch.get(branch.id) || { transaction_count: 0, total_revenue: 0 };
    const inv = inventoryByBranch.get(branch.id) || { ingredient_count: 0, healthy_count: 0 };
    const inventoryHealthPercent = inv.ingredient_count > 0
      ? Math.round((Number(inv.healthy_count) / Number(inv.ingredient_count)) * 100)
      : 100;

    return {
      branch_id: branch.id,
      branch_name: branch.name,
      transaction_count: Number(sales.transaction_count),
      total_revenue: Number(sales.total_revenue),
      items_sold: itemsByBranch.get(branch.id) || 0,
      average_sale: sales.transaction_count > 0 ? Number(sales.total_revenue) / Number(sales.transaction_count) : 0,
      inventory_health_percent: inventoryHealthPercent,
    };
  });

  res.json({ range: { start, end }, comparison });
});

/** GET /api/reports/inventory - admin, both branches with low-stock flags */
const getInventoryReport = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT inv.branch_id, b.name AS branch_name, ing.id AS ingredient_id, ing.name AS ingredient_name,
            ing.unit, ing.category, inv.quantity, ing.low_stock_threshold,
            inv.quantity <= ing.low_stock_threshold AS is_low
     FROM inventory inv
     JOIN branches b ON b.id = inv.branch_id
     JOIN ingredients ing ON ing.id = inv.ingredient_id
     ORDER BY b.name, is_low DESC, ing.category, ing.name`
  );
  const inventory = rows.map((r) => ({ ...r, is_low: !!r.is_low }));
  res.json({
    inventory,
    low_stock_count: inventory.filter((r) => r.is_low).length,
  });
});

/** GET /api/reports/top-items?branch_id=&start_date=&end_date=&limit= */
const getTopItemsReport = asyncHandler(async (req, res) => {
  const { branch_id, limit = 10 } = req.query;
  const { start, end } = dateRange(req.query);

  const clauses = ['s.created_at BETWEEN ? AND ?'];
  const params = [start, end];
  if (branch_id) {
    clauses.push('s.branch_id = ?');
    params.push(branch_id);
  }

  const [rows] = await pool.query(
    `SELECT p.id AS product_id, p.name, p.category,
            SUM(si.quantity) AS total_quantity_sold,
            SUM(si.quantity * si.price_at_sale) AS total_revenue
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     JOIN products p ON p.id = si.product_id
     WHERE ${clauses.join(' AND ')}
     GROUP BY p.id, p.name, p.category
     ORDER BY total_quantity_sold DESC
     LIMIT ?`,
    [...params, Number(limit)]
  );

  res.json({ range: { start, end }, top_items: rows });
});

module.exports = { getSalesReport, getComparisonReport, getInventoryReport, getTopItemsReport };
