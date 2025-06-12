// File: src/api/currencies/currencies.routes.js

const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const currencyValidation = require('./currencies.validation');
const currencyController = require('./currencies.controller');
const {
  authenticate,
  authorize,
} = require('../../middlewares/auth.middleware');
const Roles = require('../../core/enums/Roles');

const router = express.Router();

router.use(authenticate, authorize([Roles.ADMIN, Roles.SUPERADMIN]));

/**
 * Create a new currency and get list of currencies
 */
router
  .route('/')
  .post(
    validate(currencyValidation.createCurrency),
    currencyController.createCurrency
  )
  .get(
    validate(currencyValidation.getCurrencies),
    currencyController.getCurrencies
  );

/**
 * Update or delete a currency by ID
 */
router
  .route('/:currencyId')
  .patch(
    validate(currencyValidation.updateCurrency),
    currencyController.updateCurrency
  )
  .delete(
    validate(currencyValidation.deleteCurrency),
    currencyController.deleteCurrency
  );

module.exports = router;
