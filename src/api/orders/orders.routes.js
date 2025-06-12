const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const orderValidation = require('./orders.validation');
const orderController = require('./orders.controller');
const paymentController = require('../payments/payments.controller');
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

// Route cho Webhook từ cổng thanh toán
const webhookRouter = express.Router();

webhookRouter.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  orderController.handleStripeWebhook
);

const nowPaymentsRawBody = (req, res, next) => {
  let data = '';
  req.on('data', (chunk) => {
    data += chunk;
  });
  req.on('end', () => {
    req.rawBody = data;
    next();
  });
};

webhookRouter.post(
  '/crypto',
  express.raw({ type: 'application/json' }),
  nowPaymentsRawBody,
  paymentController.handleCryptoWebhook
);

webhookRouter.use(express.json());
webhookRouter.use(express.urlencoded({ extended: true }));

webhookRouter.post('/payment-callback', orderController.handlePaymentWebhook);
webhookRouter.get('/payment-callback', orderController.handlePaymentWebhook);

webhookRouter.post('/momo', paymentController.handleMomoWebhook);

module.exports = {
  orderRouter: router,
  webhookRouter,
};
