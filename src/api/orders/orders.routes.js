const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const orderValidation = require('./orders.validation');
const orderController = require('./orders.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Các route thao tác với đơn hàng của user hiện tại
router.use(authenticate);

router.post(
  '/',
  validate(orderValidation.createOrder),
  orderController.createOrder
);

router.get(
  '/',
  validate(orderValidation.getMyOrders),
  orderController.getMyOrders
);

router.get(
  '/:orderId',
  validate(orderValidation.getMyOrderDetails),
  orderController.getMyOrderDetails
);

// --- Route cho Webhook từ cổng thanh toán ---
// Route này KHÔNG nên dùng authenticate vì cổng thanh toán gọi đến
// Cần cơ chế bảo mật khác (signature verification) bên trong controller
const webhookRouter = express.Router();
webhookRouter.post('/payment-callback', orderController.handlePaymentWebhook);
webhookRouter.get('/payment-callback', orderController.handlePaymentWebhook);

module.exports = {
  orderRouter: router,
  webhookRouter, // Export riêng webhook router
};
