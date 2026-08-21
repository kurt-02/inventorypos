/**
 * Idempotent schema migrations for databases created before a column existed.
 *
 * schema.sql only guards at table level (CREATE TABLE IF NOT EXISTS), so a
 * database built by an earlier version keeps its old column list forever. Each
 * migration here checks INFORMATION_SCHEMA first and does nothing when the
 * change is already in place, which keeps `npm run db:seed` safe to re-run.
 */

async function columnExists(connection, dbName, table, column) {
  const [rows] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows.length > 0;
}

async function constraintExists(connection, dbName, table, constraint) {
  const [rows] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    [dbName, table, constraint]
  );
  return rows.length > 0;
}

async function columnIsNullable(connection, dbName, table, column) {
  const [rows] = await connection.query(
    `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows[0]?.IS_NULLABLE === 'YES';
}

/**
 * inventory_adjustments.sale_id — links every ingredient deducted by one
 * checkout back to that checkout, so the admin history can group them.
 *
 * Before this column existed the only trace of the originating sale was the
 * note text ("Auto-deducted for sale #12"), so existing rows are backfilled by
 * reading the id back out of that note. Nothing is deleted or rewritten: rows
 * whose note doesn't match simply keep a NULL sale_id and still display.
 */
async function addSaleIdToAdjustments(connection, dbName) {
  if (await columnExists(connection, dbName, 'inventory_adjustments', 'sale_id')) {
    return { applied: false, backfilled: 0 };
  }

  await connection.query(
    `ALTER TABLE inventory_adjustments
       ADD COLUMN sale_id INT NULL AFTER reason,
       ADD KEY idx_adjustments_sale (sale_id)`
  );

  if (!(await constraintExists(connection, dbName, 'inventory_adjustments', 'fk_adj_sale'))) {
    await connection.query(
      `ALTER TABLE inventory_adjustments
         ADD CONSTRAINT fk_adj_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL`
    );
  }

  // Recover the sale id from the legacy note text. The JOIN against sales means
  // a note pointing at a deleted sale is left NULL rather than breaking the FK.
  const [result] = await connection.query(
    `UPDATE inventory_adjustments ia
     JOIN sales s ON s.id = CAST(REGEXP_SUBSTR(ia.notes, '[0-9]+') AS UNSIGNED)
     SET ia.sale_id = s.id
     WHERE ia.reason = 'sale'
       AND ia.sale_id IS NULL
       AND ia.notes REGEXP 'sale #[0-9]+'`
  );

  return { applied: true, backfilled: result.affectedRows };
}

/**
 * sales.payment_method — how each sale was settled (cash or QRPH).
 *
 * The column is added nullable so the ALTER can't stamp an implicit value on
 * existing rows, then any sale predating it is settled as 'cash' and the column
 * is tightened to NOT NULL. After this runs, every sale has a payment method
 * and the database enforces that for new ones.
 */
async function addPaymentMethodToSales(connection, dbName) {
  const existed = await columnExists(connection, dbName, 'sales', 'payment_method');

  if (!existed) {
    await connection.query(
      `ALTER TABLE sales
         ADD COLUMN payment_method ENUM('cash', 'qrph') NULL AFTER total_amount,
         ADD KEY idx_sales_payment_method (payment_method)`
    );
  }

  // Only ever matches rows from a database built before the column existed.
  const [result] = await connection.query(
    "UPDATE sales SET payment_method = 'cash' WHERE payment_method IS NULL"
  );

  // Skipped once already enforced, so a re-run doesn't rebuild the table.
  if (await columnIsNullable(connection, dbName, 'sales', 'payment_method')) {
    await connection.query(
      "ALTER TABLE sales MODIFY payment_method ENUM('cash', 'qrph') NOT NULL"
    );
  }

  return { applied: !existed, settled: result.affectedRows };
}

async function indexExists(connection, dbName, table, index) {
  const [rows] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [dbName, table, index]
  );
  return rows.length > 0;
}

/**
 * Indexes for the paged list screens.
 *
 * Each one exists because a query the UI actually issues was measured reading
 * far more rows than it returns:
 *
 * - sales(created_at): the sales report over "all branches" could only skip-scan
 *   idx_sales_branch_created and then filesort the result.
 * - sales(payment_method, created_at): replaces a single-column payment_method
 *   index, which was near-useless on a two-value column. Leading with the method
 *   and trailing with the date lets one seek satisfy the filter, the range and
 *   the ORDER BY together.
 * - inventory_adjustments(adjusted_at, id) and the branch/reason variants: the
 *   history was a full scan plus filesort over every adjustment ever recorded,
 *   for a screen that shows 25 rows. One index per filter the UI exposes.
 */
const LIST_INDEXES = [
  { table: 'sales', name: 'idx_sales_created_at', definition: '(created_at)' },
  { table: 'sales', name: 'idx_sales_payment_created', definition: '(payment_method, created_at)' },
  { table: 'inventory_adjustments', name: 'idx_adjustments_recent', definition: '(adjusted_at, id)' },
  { table: 'inventory_adjustments', name: 'idx_adjustments_branch_recent', definition: '(branch_id, adjusted_at)' },
  { table: 'inventory_adjustments', name: 'idx_adjustments_reason_recent', definition: '(reason, adjusted_at)' },
];

async function addListIndexes(connection, dbName) {
  let added = 0;

  for (const { table, name, definition } of LIST_INDEXES) {
    if (await indexExists(connection, dbName, table, name)) continue;
    await connection.query(`ALTER TABLE ${table} ADD INDEX ${name} ${definition}`);
    added++;
  }

  // Superseded by idx_sales_payment_created, which leads with the same column.
  if (await indexExists(connection, dbName, 'sales', 'idx_sales_payment_method')) {
    await connection.query('ALTER TABLE sales DROP INDEX idx_sales_payment_method');
  }

  return added;
}

/** Runs every migration in order. Safe to call on an already-current database. */
async function runMigrations(connection, dbName) {
  const saleId = await addSaleIdToAdjustments(connection, dbName);
  if (saleId.applied) {
    console.log(
      `  Added inventory_adjustments.sale_id (${saleId.backfilled} existing sale row(s) linked).`
    );
  } else {
    console.log('  inventory_adjustments.sale_id already present - skipped.');
  }

  const payment = await addPaymentMethodToSales(connection, dbName);
  if (payment.applied) {
    console.log(
      `  Added sales.payment_method (${payment.settled} earlier sale(s) settled as cash).`
    );
  } else {
    console.log('  sales.payment_method already present - skipped.');
  }

  const indexes = await addListIndexes(connection, dbName);
  console.log(
    indexes > 0
      ? `  Added ${indexes} list index(es) for paged history and reports.`
      : '  List indexes already present - skipped.'
  );
}

module.exports = { runMigrations };
