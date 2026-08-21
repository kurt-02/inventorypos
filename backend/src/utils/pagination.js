/**
 * Shared helpers for paged list endpoints.
 *
 * Every list that grows with usage - sales, adjustments - pages through the
 * database with LIMIT/OFFSET rather than returning the whole table and letting
 * the client slice it. The cap matters as much as the default: without a
 * maximum, a caller could ask for `?limit=999999` and reintroduce exactly the
 * unbounded response the paging exists to prevent.
 */

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 100;

/**
 * Reads `page` and `limit` off a query string, clamping both into a safe range.
 * Junk values fall back to the defaults instead of reaching SQL as NaN.
 */
function parsePagination(query = {}, { defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT } = {}) {
  const rawLimit = Number.parseInt(query.limit, 10);
  const rawPage = Number.parseInt(query.page, 10);

  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), maxLimit)
    : defaultLimit;
  const page = Number.isFinite(rawPage) ? Math.max(rawPage, 1) : 1;

  return { page, limit, offset: (page - 1) * limit };
}

/**
 * Describes the slice the client just received, so the UI can render controls
 * without guessing how many pages exist or issuing a probe request.
 */
function buildPageMeta({ page, limit, total }) {
  const totalCount = Number(total) || 0;
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / limit);

  return {
    page,
    limit,
    total: totalCount,
    total_pages: totalPages,
    has_prev: page > 1,
    has_next: page < totalPages,
  };
}

module.exports = { parsePagination, buildPageMeta, DEFAULT_LIMIT, MAX_LIMIT };
