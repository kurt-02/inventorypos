const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { signAccessToken, signRefreshToken, durationToDate } = require('../utils/tokens');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/api/auth',
};

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    branch_id: user.branch_id,
  };
}

/** POST /api/auth/login */
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    throw new ApiError(400, 'Username and password are required.');
  }

  const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
  const user = rows[0];

  // Deliberately identical error message for "no such user" and "wrong
  // password" so login can't be used to enumerate valid usernames.
  if (!user || !user.is_active) {
    throw new ApiError(401, 'Invalid username or password.');
  }

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) {
    throw new ApiError(401, 'Invalid username or password.');
  }

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  const expiresAt = durationToDate(process.env.JWT_REFRESH_EXPIRES_IN);

  await pool.query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
    [user.id, refreshToken, expiresAt]
  );

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...REFRESH_COOKIE_OPTIONS,
    expires: expiresAt,
  });

  res.json({ accessToken, user: publicUser(user) });
});

/**
 * POST /api/auth/refresh
 * Reads the httpOnly refresh cookie, validates it against both the JWT
 * signature/expiry and the server-side refresh_tokens table (so a logged-out
 * or deactivated user's refresh token stops working immediately), rotates it,
 * and issues a fresh access token.
 */
const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!token) {
    throw new ApiError(401, 'No refresh token provided.');
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
    throw new ApiError(401, 'Refresh token invalid or expired.');
  }

  const [tokenRows] = await pool.query(
    'SELECT * FROM refresh_tokens WHERE token = ? AND user_id = ? AND expires_at > NOW()',
    [token, payload.id]
  );
  if (tokenRows.length === 0) {
    res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
    throw new ApiError(401, 'Refresh token revoked or expired.');
  }

  const [userRows] = await pool.query('SELECT * FROM users WHERE id = ?', [payload.id]);
  const user = userRows[0];
  if (!user || !user.is_active) {
    res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
    throw new ApiError(401, 'Account no longer active.');
  }

  // Rotate: invalidate the old refresh token, issue a new one.
  await pool.query('DELETE FROM refresh_tokens WHERE id = ?', [tokenRows[0].id]);
  const newRefreshToken = signRefreshToken(user);
  const expiresAt = durationToDate(process.env.JWT_REFRESH_EXPIRES_IN);
  await pool.query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
    [user.id, newRefreshToken, expiresAt]
  );
  res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, { ...REFRESH_COOKIE_OPTIONS, expires: expiresAt });

  const accessToken = signAccessToken(user);
  res.json({ accessToken, user: publicUser(user) });
});

/** POST /api/auth/logout */
const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (token) {
    await pool.query('DELETE FROM refresh_tokens WHERE token = ?', [token]);
  }
  res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
  res.json({ message: 'Logged out.' });
});

module.exports = { login, refresh, logout };
