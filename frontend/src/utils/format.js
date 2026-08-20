/** Currency formatting used across the POS and reports. */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

/** Trims trailing zeros so "150.000 ml" renders as "150 ml". */
export function formatQuantity(value) {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(3)));
}

export function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * YYYY-MM-DD for <input type="date"> values and report query params.
 * Uses local date parts rather than toISOString(), which converts to UTC and
 * would report the wrong "today" for anyone not on GMT.
 */
export function toDateInput(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
