// File: src/api/exchangeRates/exchangeRates.controller.js
const httpStatus = require('http-status').status;
const exchangeRateService = require('./exchange-rates.service');
const { catchAsync } = require('../../utils/catchAsync');
const { pick } = require('../../utils/pick');

const updateRatesNow = catchAsync(async (req, res) => {
  const newRates = await exchangeRateService.updateExchangeRates();
  res.status(httpStatus.OK).send({
    message: 'Exchange rates updated successfully.',
    newRates, // Trả về mảng các tỷ giá mới
  });
});

const getHistory = catchAsync(async (req, res) => {
  const options = pick(req.query, ['page', 'limit']);
  const result = await exchangeRateService.getExchangeRateHistory(options);
  res.status(httpStatus.OK).send(result);
});

module.exports = {
  updateRatesNow,
  getHistory,
};
