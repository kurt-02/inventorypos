const express = require('express');
const { authenticate, requireRole, enforceOwnBranch } = require('../middleware/auth');
const {
  getBranchInventory,
  getAllInventory,
  checkInventory,
  adjustInventory,
  getAdjustmentHistory,
} = require('../controllers/inventoryController');

const router = express.Router();

router.use(authenticate);

// Admin-only: both branches at once, manual adjustments, and history.
// These are declared before the /:branch_id route so "adjust"/"adjustments"/
// "check" are never mistaken for a branch id.
router.get('/', requireRole('admin'), getAllInventory);
router.put('/adjust', requireRole('admin'), adjustInventory);
router.get('/adjustments', requireRole('admin'), getAdjustmentHistory);

// Cashier: end-of-shift count confirmation for their own branch.
router.put('/check', requireRole('cashier'), enforceOwnBranch, checkInventory);

// Shared: view a specific branch's inventory (cashier limited to their own).
router.get('/:branch_id', enforceOwnBranch, getBranchInventory);

module.exports = router;
