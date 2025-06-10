// File: src/api/exchangeRates/exchangeRates.routes.js
const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const exchangeRateValidation = require('./exchangeRates.validation');
const exchangeRateController = require('./exchangeRates.controller');
const {
  authenticate,
  authorize,
} = require('../../middlewares/auth.middleware');
const Roles = require('../../core/enums/Roles');

const router = express.Router();

// Tất cả route này yêu cầu quyền Admin
router.use(authenticate, authorize([Roles.ADMIN, Roles.SUPERADMIN]));

router.post('/update-now', exchangeRateController.updateRatesNow);

router.get(
  '/',
  validate(exchangeRateValidation.getExchangeRates),
  exchangeRateController.getHistory
);

module.exports = router;
