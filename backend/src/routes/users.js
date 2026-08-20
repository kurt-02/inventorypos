const express = require('express');
const { body } = require('express-validator');
const { authenticate, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { getUsers, createUser, updateUser, deleteUser } = require('../controllers/usersController');

const router = express.Router();

router.use(authenticate, requireRole('admin'));

router.get('/', getUsers);

router.post(
  '/',
  [
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters.'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
    body('full_name').trim().notEmpty().withMessage('Full name is required.'),
    body('role').isIn(['admin', 'cashier']).withMessage('Role must be admin or cashier.'),
  ],
  validate,
  createUser
);

router.put(
  '/:id',
  [
    body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
    body('role').optional().isIn(['admin', 'cashier']),
  ],
  validate,
  updateUser
);

router.delete('/:id', deleteUser);

module.exports = router;
