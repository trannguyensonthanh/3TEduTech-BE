// File: src/api/exchangeRates/exchangeRates.controller.js
const httpStatus = require('http-status').status;
const exchangeRateService = require('./exchangeRates.service');
const { catchAsync } = require('../../utils/catchAsync');
const { pick } = require('../../utils/pick');

const updateRatesNow = catchAsync(async (req, res) => {
  const newRates = await exchangeRateService.updateExchangeRates();
  res.status(httpStatus.OK).send({
    message: 'Exchange rates updated successfully.',
    newRates,
  });
});

const getHistory = catchAsync(async (req, res) => {
  const options = pick(req.query, [
    'page',
    'limit',
    'fromCurrency',
    'toCurrency',
  ]);
  const result = await exchangeRateService.getExchangeRateHistory(options);
  res.status(httpStatus.OK).send(result);
});

const createExchangeRate = catchAsync(async (req, res) => {
  const rate = await exchangeRateService.createManualExchangeRate(req.body);
  res.status(httpStatus.CREATED).send(rate);
});

const updateExchangeRate = catchAsync(async (req, res) => {
  const rate = await exchangeRateService.updateManualExchangeRate(
    req.params.rateId,
    req.body
  );
  res.status(httpStatus.OK).send(rate);
});

const deleteExchangeRate = catchAsync(async (req, res) => {
  await exchangeRateService.deleteExchangeRate(req.params.rateId);
  res.status(httpStatus.NO_CONTENT).send();
});

const fetchExternalRate = catchAsync(async (req, res) => {
  const { from, to } = req.query;
  const result = await exchangeRateService.fetchSingleExternalRate(from, to);
  res.status(httpStatus.OK).send(result);
});

const getLatestRate = catchAsync(async (req, res) => {
  const { from, to } = req.query;
  const rateInfo = await exchangeRateService.getLatestPublishedRate(from, to);
  res.status(httpStatus.OK).send(rateInfo);
});

module.exports = {
  updateRatesNow,
  getHistory,
  createExchangeRate,
  updateExchangeRate,
  deleteExchangeRate,
  fetchExternalRate,
  getLatestRate,
};
