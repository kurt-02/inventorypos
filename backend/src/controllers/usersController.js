const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');

function publicUser(user) {
  const { password_hash, ...rest } = user; // eslint-disable-line no-unused-vars
  return rest;
}

/** GET /api/users - admin only */
const getUsers = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.full_name, u.role, u.branch_id, b.name AS branch_name,
            u.is_active, u.created_at
     FROM users u
     LEFT JOIN branches b ON b.id = u.branch_id
     ORDER BY u.role, u.username`
  );
  res.json({ users: rows });
});

/** POST /api/users - admin only. Creates a cashier (or another admin). */
const createUser = asyncHandler(async (req, res) => {
  const { username, password, full_name, role, branch_id } = req.body;

  if (!username || !password || !full_name || !role) {
    throw new ApiError(400, 'username, password, full_name and role are required.');
  }
  if (!['admin', 'cashier'].includes(role)) {
    throw new ApiError(400, 'role must be "admin" or "cashier".');
  }
  if (role === 'cashier' && !branch_id) {
    throw new ApiError(400, 'Cashiers must be assigned to a branch_id.');
  }
  if (password.length < 6) {
    throw new ApiError(400, 'Password must be at least 6 characters.');
  }

  const password_hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role, branch_id, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [username, password_hash, full_name, role, role === 'admin' ? null : branch_id]
  );

  const [[created]] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
  res.status(201).json(publicUser(created));
});

/** PUT /api/users/:id - admin only. Edit profile/branch/role, optionally reset password. */
const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { full_name, role, branch_id, password, is_active } = req.body;

  const [existingRows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  const existing = existingRows[0];
  if (!existing) throw new ApiError(404, 'User not found.');

  const nextRole = role ?? existing.role;
  const nextBranch = nextRole === 'admin' ? null : (branch_id ?? existing.branch_id);
  if (nextRole === 'cashier' && !nextBranch) {
    throw new ApiError(400, 'Cashiers must be assigned to a branch_id.');
  }

  let password_hash = existing.password_hash;
  if (password) {
    if (password.length < 6) throw new ApiError(400, 'Password must be at least 6 characters.');
    password_hash = await bcrypt.hash(password, 10);
  }

  await pool.query(
    `UPDATE users SET full_name = ?, role = ?, branch_id = ?, password_hash = ?, is_active = ?
     WHERE id = ?`,
    [
      full_name ?? existing.full_name,
      nextRole,
      nextBranch,
      password_hash,
      is_active ?? existing.is_active,
      id,
    ]
  );

  const [[updated]] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  res.json(publicUser(updated));
});

/** DELETE /api/users/:id - admin only. Soft delete: deactivate rather than remove,
 * to keep the sales/adjustment history's cashier references intact. */
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (Number(id) === req.user.id) {
    throw new ApiError(400, 'You cannot deactivate your own account.');
  }
  const [result] = await pool.query('UPDATE users SET is_active = 0 WHERE id = ?', [id]);
  if (result.affectedRows === 0) throw new ApiError(404, 'User not found.');
  res.json({ message: 'User deactivated.' });
});

module.exports = { getUsers, createUser, updateUser, deleteUser };
