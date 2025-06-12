const Joi = require('joi');

// Tạo URL thanh toán VNPay
const createVnpayUrl = {
  body: Joi.object().keys({
    orderId: Joi.number().integer().required(),
    bankCode: Joi.string().allow(null, ''),
    locale: Joi.string().valid('vn', 'en').default('vn'),
  }),
};

// Xử lý trả về từ VNPay
const vnpayReturn = {
  query: Joi.object().unknown(true),
};

// Xử lý IPN từ VNPay
const vnpayIpn = {
  query: Joi.object().unknown(true),
};

// Tạo hóa đơn thanh toán Crypto
const createCryptoInvoice = {
  body: Joi.object().keys({
    orderId: Joi.number().integer().required(),
    cryptoCurrency: Joi.string().required().trim().lowercase(),
  }),
};

// Tạo đơn hàng PayPal
const createPayPalOrder = {
  body: Joi.object().keys({
    orderId: Joi.number().integer().required(),
  }),
};

// Xác nhận thanh toán PayPal
const capturePayPalOrder = {
  body: Joi.object().keys({
    orderId: Joi.string().required(),
    internalOrderId: Joi.number().integer().required(),
  }),
};

// Tạo URL thanh toán Momo
const createMomoUrl = {
  body: Joi.object().keys({
    orderId: Joi.number().integer().required(),
  }),
};

module.exports = {
  createVnpayUrl,
  vnpayReturn,
  vnpayIpn,
  createCryptoInvoice,
  createPayPalOrder,
  capturePayPalOrder,
  createMomoUrl,
};
