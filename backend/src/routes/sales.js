const express = require('express');
const { authenticate, requireRole, enforceOwnBranch } = require('../middleware/auth');
const { createSale, getTodaySales } = require('../controllers/salesController');

const router = express.Router();

router.use(authenticate);

// Cashiers ring up sales for their own branch; admins may also use this if needed.
router.post('/', requireRole('cashier', 'admin'), enforceOwnBranch, createSale);

// Today's sales for a given branch - cashiers restricted to their own branch,
// admins can pass any branch_id.
router.get('/today/:branch_id', enforceOwnBranch, getTodaySales);

module.exports = router;
