const express = require('express');
const { body } = require('express-validator');
const { authenticate, requireRole, enforceOwnBranch } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { PAYMENT_METHOD_VALUES } = require('../constants/paymentMethods');
const { createSale, getTodaySales } = require('../controllers/salesController');

const router = express.Router();

router.use(authenticate);

// Cashiers ring up sales for their own branch; admins may also use this if needed.
router.post(
  '/',
  requireRole('cashier', 'admin'),
  enforceOwnBranch,
  [
    body('payment_method')
      .isIn(PAYMENT_METHOD_VALUES)
      .withMessage(`Payment method must be one of: ${PAYMENT_METHOD_VALUES.join(', ')}.`),
  ],
  validate,
  createSale
);

// Today's sales for a given branch - cashiers restricted to their own branch,
// admins can pass any branch_id.
router.get('/today/:branch_id', enforceOwnBranch, getTodaySales);

module.exports = router;
