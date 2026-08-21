/**
 * Payment methods a cashier can settle a sale with.
 *
 * Mirrors backend/src/constants/paymentMethods.js - the server validates every
 * sale against its own copy, so this list only decides what the POS offers.
 * Keep the two in step when adding a method.
 */
export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash', hint: 'Physical cash in the drawer' },
  { value: 'qrph', label: 'QRPH', hint: 'GCash, Maya and other QR payments' },
];

/** Human-readable label for a stored value, for history and report screens. */
export function paymentMethodLabel(value) {
  return PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value;
}
