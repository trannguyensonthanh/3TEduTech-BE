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

// Tất cả các route này yêu cầu quyền Admin/SuperAdmin
router.use(authenticate, authorize([Roles.ADMIN, Roles.SUPERADMIN]));

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
