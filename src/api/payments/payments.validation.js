const Joi = require('joi');

const createVnpayUrl = {
  body: Joi.object().keys({
    orderId: Joi.number().integer().required(),
    bankCode: Joi.string().allow(null, ''), // Optional
    locale: Joi.string().valid('vn', 'en').default('vn'),
  }),
};

const vnpayReturn = {
  query: Joi.object().unknown(true), // Cho phép tất cả query params từ VNPay
};

const vnpayIpn = {
  query: Joi.object().unknown(true), // Cho phép tất cả query params từ VNPay
};

module.exports = {
  createVnpayUrl,
  vnpayReturn,
  vnpayIpn,
};
