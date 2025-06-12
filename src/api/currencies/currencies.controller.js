// File: src/api/currencies/currencies.controller.js

const httpStatus = require('http-status').status;
const currencyService = require('./currencies.service');
const { catchAsync } = require('../../utils/catchAsync');
const { pick } = require('../../utils/pick');

/**
 * Tạo mới một currency
 */
const createCurrency = catchAsync(async (req, res) => {
  const currency = await currencyService.createCurrency(req.body);
  res.status(httpStatus.CREATED).send(currency);
});

/**
 * Lấy danh sách các currency
 */
const getCurrencies = catchAsync(async (req, res) => {
  const options = pick(req.query, ['page', 'limit', 'searchTerm']);
  const result = await currencyService.getCurrencies(options);
  res.status(httpStatus.OK).send(result);
});

/**
 * Cập nhật thông tin currency
 */
const updateCurrency = catchAsync(async (req, res) => {
  const currency = await currencyService.updateCurrency(
    req.params.currencyId,
    req.body
  );
  res.status(httpStatus.OK).send(currency);
});

/**
 * Xóa một currency
 */
const deleteCurrency = catchAsync(async (req, res) => {
  await currencyService.deleteCurrency(req.params.currencyId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createCurrency,
  getCurrencies,
  updateCurrency,
  deleteCurrency,
};
