// src/api/payments/paymentMethod.validation.js
const Joi = require('joi');

const createPaymentMethod = {
  body: Joi.object().keys({
    methodId: Joi.string().required().max(20).trim().uppercase(), // Chuẩn hóa ID
    methodName: Joi.string().required().max(100),
    iconUrl: Joi.string().uri().max(500).allow(null, ''),
    description: Joi.string().max(255).allow(null, ''),
  }),
};

const getPaymentMethod = {
  params: Joi.object().keys({
    methodId: Joi.string().required().max(20),
  }),
};

const updatePaymentMethod = {
  params: Joi.object().keys({
    methodId: Joi.string().required().max(20),
  }),
  body: Joi.object()
    .keys({
      methodName: Joi.string().required().max(100),
      iconUrl: Joi.string().uri().max(500).allow(null, ''),
      description: Joi.string().max(255).allow(null, ''),
    })
    .min(1),
};

const deletePaymentMethod = {
  params: Joi.object().keys({
    methodId: Joi.string().required().max(20),
  }),
};

module.exports = {
  createPaymentMethod,
  getPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
};
