const crypto = require('crypto');
const jwt = require('jsonwebtoken');

/** Builds the JWT payload shared by both token types (kept minimal on purpose). */
function buildPayload(user) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    branch_id: user.branch_id,
  };
}

function signAccessToken(user) {
  return jwt.sign(buildPayload(user), process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  });
}

/**
 * The random `jti` matters: JWT's own `iat` claim only has one-second
 * resolution, so without it two refreshes inside the same second would
 * produce byte-identical tokens and rotation would be meaningless - deleting
 * the "old" row would delete the new one too, and a stolen token would stay
 * valid. The jti guarantees every issued refresh token is a distinct string.
 */
function signRefreshToken(user) {
  return jwt.sign(
    { id: user.id, jti: crypto.randomBytes(16).toString('hex') },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

/**
 * Converts a duration string like "15m", "7d", "2h", "30s" into a future
 * JS Date. Used to store refresh_tokens.expires_at alongside the JWT's own
 * (self-contained) expiry, so we can also invalidate tokens server-side.
 */
function durationToDate(duration) {
  const match = /^(\d+)([smhd])$/.exec(duration || '7d');
  const [, amountStr, unit] = match || [null, '7', 'd'];
  const amount = Number(amountStr);
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return new Date(Date.now() + amount * unitMs);
}

module.exports = { signAccessToken, signRefreshToken, durationToDate };
