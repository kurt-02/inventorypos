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

module.exports = { PAYMENT_METHODS, PAYMENT_METHOD_VALUES };
