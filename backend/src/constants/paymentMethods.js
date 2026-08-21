/**
 * The payment methods a sale can be settled with.
 *
 * This is the server-side source of truth: route validation and the sale
 * controller both check against it, so an unknown method can never reach the
 * database regardless of what the client sends.
 *
 * Adding a method later takes three coordinated steps:
 *   1. add it here,
 *   2. widen the `sales.payment_method` ENUM (schema.sql for fresh installs,
 *      plus a migration in database/migrate.js for existing databases),
 *   3. add the matching entry to frontend/src/constants/paymentMethods.js
 *      so cashiers can actually pick it.
 */

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'qrph', label: 'QRPH' },
];

/** Just the stored values, for validation and SQL ENUM checks. */
const PAYMENT_METHOD_VALUES = PAYMENT_METHODS.map((m) => m.value);

/**
 * Totals a list of sale rows per payment method, so a caller can answer
 * "how much came in as cash vs QRPH" without a second query.
 *
 * Every known method is always present (as a zero bucket when unused) so the
 * UI can render a stable set of figures.
 */
function summarizeByPaymentMethod(sales) {
  const summary = {};
  for (const value of PAYMENT_METHOD_VALUES) {
    summary[value] = { count: 0, total: 0 };
  }

  for (const sale of sales) {
    // Unreachable while the ENUM and this list agree - it only guards the gap
    // where a new method reaches the database before it is added here.
    const bucket = summary[sale.payment_method];
    if (!bucket) continue;
    bucket.count += 1;
    bucket.total += Number(sale.total_amount);
  }

  return summary;
}

module.exports = { PAYMENT_METHODS, PAYMENT_METHOD_VALUES, summarizeByPaymentMethod };
