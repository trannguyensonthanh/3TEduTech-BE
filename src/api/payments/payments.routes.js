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

// Route tạo session thanh toán Stripe
router.post(
  '/stripe/create-checkout-session',
  authenticate,
  validate(paymentValidation.createStripeSession),
  paymentController.createStripeCheckoutSession
);

// Route tạo hóa đơn thanh toán Crypto
router.post(
  '/crypto/create-invoice',
  authenticate,
  validate(paymentValidation.createCryptoInvoice),
  paymentController.createCryptoInvoice
);

// Route tạo order PayPal
router.post(
  '/paypal/create-order',
  authenticate,
  validate(paymentValidation.createPayPalOrder),
  paymentController.createPayPalOrder
);

// Route capture order PayPal
router.post(
  '/paypal/capture-order',
  authenticate,
  validate(paymentValidation.capturePayPalOrder),
  paymentController.capturePayPalOrder
);

// Route tạo URL thanh toán MoMo
router.post(
  '/momo/create-payment-url',
  authenticate,
  validate(paymentValidation.createMomoUrl),
  paymentController.createMomoPaymentUrl
);

module.exports = router;
