// File: src/api/currencies/currencies.validation.js
const Joi = require('joi');

const createCurrency = {
  body: Joi.object().keys({
    currencyId: Joi.string().required().max(10).trim().uppercase(),
    currencyName: Joi.string().required().max(100),
    type: Joi.string().required().valid('FIAT', 'CRYPTO'),
    decimalPlaces: Joi.number().integer().min(0).max(18).required(),
  }),
};

const getCurrencies = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
    searchTerm: Joi.string().allow('', null),
  }),
};

const updateCurrency = {
  params: Joi.object().keys({
    currencyId: Joi.string().required().max(10),
  }),
  body: Joi.object()
    .keys({
      currencyName: Joi.string().max(100),
      type: Joi.string().valid('FIAT', 'CRYPTO'),
      decimalPlaces: Joi.number().integer().min(0).max(18),
    })
    .min(1),
};

const deleteCurrency = {
  params: Joi.object().keys({
    currencyId: Joi.string().required().max(10),
  }),
};

module.exports = {
  createCurrency,
  getCurrencies,
  updateCurrency,
  deleteCurrency,
};
