const jwt = require('jsonwebtoken');

/**
 * Verifies the JWT access token sent as `Authorization: Bearer <token>`.
 * On success, attaches { id, username, role, branch_id } to req.user.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access token expired.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid access token.' });
  }
}

/**
 * Restricts a route to one or more roles, e.g. requireRole('admin').
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

/**
 * For cashier-scoped routes that take a :branch_id or branch_id in the body -
 * a cashier may only ever touch their own branch's data. Admins bypass this
 * check entirely since they operate across both branches.
 */
function enforceOwnBranch(req, res, next) {
  if (req.user.role === 'admin') return next();

  const requestedBranchId = Number(
    req.params.branch_id ?? req.body.branch_id ?? req.query.branch_id
  );

  if (!requestedBranchId || requestedBranchId !== req.user.branch_id) {
    return res.status(403).json({ error: 'You can only access your own branch.' });
  }
  next();
}

module.exports = { authenticate, requireRole, enforceOwnBranch };
