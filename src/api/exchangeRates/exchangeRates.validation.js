// File: src/api/exchangeRates/exchangeRates.validation.js
const Joi = require('joi');

const getExchangeRates = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
    fromCurrency: Joi.string().max(10).uppercase(),
    toCurrency: Joi.string().max(10).uppercase(),
  }),
};

const createExchangeRate = {
  body: Joi.object().keys({
    fromCurrencyId: Joi.string().required().max(10).uppercase(),
    toCurrencyId: Joi.string().required().max(10).uppercase(),
    rate: Joi.number().required().positive(),
    source: Joi.string().max(100).allow('', null),
    effectiveTimestamp: Joi.date().iso().default(new Date()),
  }),
};

const updateExchangeRate = {
  params: Joi.object().keys({
    rateId: Joi.number().integer().required(),
  }),
  body: Joi.object()
    .keys({
      rate: Joi.number().positive(),
      effectiveTimestamp: Joi.date().iso(),
      source: Joi.string().max(100).allow('', null),
    })
    .min(1),
};

const deleteExchangeRate = {
  params: Joi.object().keys({
    rateId: Joi.number().integer().required(),
  }),
};

const fetchExternalRate = {
  query: Joi.object().keys({
    from: Joi.string().required().max(10).uppercase(),
    to: Joi.string().required().max(10).uppercase(),
  }),
};

const getLatestRate = {
  query: Joi.object().keys({
    from: Joi.string()
      .required()
      .max(10)
      .uppercase()
      .description('Source currency code (e.g., VND)'),
    to: Joi.string()
      .required()
      .max(10)
      .uppercase()
      .description('Target currency code (e.g., USD)'),
  }),
};

module.exports = {
  getExchangeRates,
  createExchangeRate,
  updateExchangeRate,
  deleteExchangeRate,
  fetchExternalRate,
  getLatestRate,
};
