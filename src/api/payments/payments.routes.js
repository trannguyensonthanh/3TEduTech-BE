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

// Route xử lý IPN đã được mount ở app.js (/webhooks/payment-callback)
// Nếu muốn đặt ở đây:
// router.get('/vnpay_ipn',
//      validate(paymentValidation.vnpayIpn),
//      orderController.handlePaymentWebhook // Gọi controller từ order hoặc tạo controller riêng ở payment
// );

module.exports = router;
