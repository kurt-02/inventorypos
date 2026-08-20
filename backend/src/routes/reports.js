const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const {
  getSalesReport,
  getComparisonReport,
  getInventoryReport,
  getTopItemsReport,
} = require('../controllers/reportsController');

const router = express.Router();

router.use(authenticate, requireRole('admin'));

router.get('/sales', getSalesReport);
router.get('/comparison', getComparisonReport);
router.get('/inventory', getInventoryReport);
router.get('/top-items', getTopItemsReport);

module.exports = router;
