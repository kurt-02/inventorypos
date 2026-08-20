const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { login, refresh, logout } = require('../controllers/authController');

const router = express.Router();

router.post(
  '/login',
  [body('username').notEmpty(), body('password').notEmpty()],
  validate,
  login
);
router.post('/refresh', refresh);
router.post('/logout', logout);

module.exports = router;
