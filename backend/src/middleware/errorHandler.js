/**
 * Central error handler. Anything passed to next(err) - or thrown inside a
 * handler wrapped by asyncHandler - ends up here so every response has a
 * consistent JSON shape and status code.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // mysql2 duplicate-entry errors (e.g. unique username, unique branch+ingredient)
  if (err.code === 'ER_DUP_ENTRY') {
    err.status = 409;
    err.message = 'A record with that value already exists.';
  }

  // mysql2 foreign-key errors (referencing a branch/product/user that doesn't exist)
  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
    err.status = 400;
    err.message = 'Referenced record does not exist.';
  }

  const status = err.status || 500;

  // Only 5xx errors are bugs worth a stack trace. 4xx responses are the API
  // working as designed - a rejected login, a cashier blocked from another
  // branch, a failed validation - and dumping traces for those buries the
  // real failures in noise.
  if (status >= 500) {
    console.error(`${req.method} ${req.originalUrl} -> ${status}`);
    console.error(err);
  } else {
    console.warn(`${req.method} ${req.originalUrl} -> ${status} ${err.message}`);
  }

  const message = status === 500 ? 'Internal server error.' : err.message;
  res.status(status).json({ error: message });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

/** Small helper for controllers to throw an error with an HTTP status attached. */
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { errorHandler, notFoundHandler, ApiError };
