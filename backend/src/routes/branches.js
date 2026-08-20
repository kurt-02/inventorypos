const express = require('express');
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/** GET /api/branches - used by admin dropdowns (user assignment, filters). */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT id, name, location FROM branches ORDER BY id');
    res.json({ branches: rows });
  })
);

module.exports = router;
