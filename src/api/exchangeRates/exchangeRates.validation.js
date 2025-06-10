// File: src/api/exchangeRates/exchangeRates.validation.js
const Joi = require('joi');

const getExchangeRates = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
  }),
};

module.exports = {
  getExchangeRates,
};
