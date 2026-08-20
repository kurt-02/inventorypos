const { validationResult } = require('express-validator');

/**
 * Run after an array of express-validator checks. If any failed, responds
 * 400 with the list of validation errors instead of reaching the controller.
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed.', details: errors.array() });
  }
  next();
}

module.exports = validate;
