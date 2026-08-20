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
}

module.exports = { runMigrations };
