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

router.use(
  authenticate,
  authorize([Roles.ADMIN, Roles.SUPERADMIN, Roles.INSTRUCTOR])
);

router.post('/update-now', exchangeRateController.updateRatesNow);
router.get(
  '/latest',
  validate(exchangeRateValidation.getLatestRate),
  exchangeRateController.getLatestRate
);
router
  .route('/')
  .get(
    validate(exchangeRateValidation.getExchangeRates),
    exchangeRateController.getHistory
  )
  .post(
    validate(exchangeRateValidation.createExchangeRate),
    exchangeRateController.createExchangeRate
  );

router
  .route('/:rateId')
  .patch(
    validate(exchangeRateValidation.updateExchangeRate),
    exchangeRateController.updateExchangeRate
  )
  .delete(
    validate(exchangeRateValidation.deleteExchangeRate),
    exchangeRateController.deleteExchangeRate
  );

router.get(
  '/fetch-external-rate',
  validate(exchangeRateValidation.fetchExternalRate),
  exchangeRateController.fetchExternalRate
);

module.exports = router;
