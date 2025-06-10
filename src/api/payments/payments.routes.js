const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const paymentValidation = require('./payments.validation');
const paymentController = require('./payments.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Route tạo URL thanh toán (yêu cầu đăng nhập)
router.post(
  '/vnpay/create-url',
  authenticate,
  validate(paymentValidation.createVnpayUrl),
  paymentController.createVnpayUrl
);

// Route xử lý Return URL từ VNPay (không cần authenticate)
router.get(
  '/vnpay_return',
  validate(paymentValidation.vnpayReturn),
  paymentController.handleVnpayReturn
);

router.post(
  '/stripe/create-checkout-session',
  authenticate,
  validate(paymentValidation.createStripeSession),
  paymentController.createStripeCheckoutSession
);

router.post(
  '/crypto/create-invoice',
  authenticate,
  validate(paymentValidation.createCryptoInvoice),
  paymentController.createCryptoInvoice
);

module.exports = router;
