const httpStatus = require('http-status').status;
const orderService = require('./orders.service');
const { catchAsync } = require('../../utils/catchAsync');
const { pick } = require('../../utils/pick');
const OrderStatus = require('../../core/enums/OrderStatus');
const paymentService = require('../payments/payments.service');
const logger = require('../../utils/logger');
const config = require('../../config');
const stripe = require('../../config/stripe');

// Tạo đơn hàng từ giỏ hàng
const createOrder = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const options = {
    promotionCode: req.body.promotionCode,
    currency: req.targetCurrency,
  };
  const order = await orderService.createOrderFromCart(accountId, options);
  res.status(httpStatus.CREATED).send(order);
});

// Lấy danh sách đơn hàng của tôi
const getMyOrders = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const options = pick(req.query, ['limit', 'page', 'status']);
  const result = await orderService.getMyOrders(accountId, options);
  res.status(httpStatus.OK).send(result);
});

// Lấy chi tiết đơn hàng của tôi
const getMyOrderDetails = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const { orderId } = req.params;
  const orderDetails = await orderService.getMyOrderDetails(accountId, orderId);
  res.status(httpStatus.OK).send(orderDetails);
});

// Callback/Webhook (Ví dụ - Sẽ cần điều chỉnh theo cổng thanh toán)
const handlePaymentWebhook = catchAsync(async (req, res) => {
  const vnpParams = req.query;
  logger.info('Received VNPay IPN:', vnpParams);
  const result = await paymentService.processVnpayIpn(vnpParams);
  res.status(httpStatus.OK).json({
    RspCode: result.RspCode,
    Message: result.Message,
  });
});

const handleStripeWebhook = catchAsync(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  console.log(
    'Webhook Raw Body Type:',
    Buffer.isBuffer(req.body) ? 'Buffer' : typeof req.body
  );
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      config.stripe.webhookSecret
    );
  } catch (err) {
    logger.error(`⚠️  Webhook signature verification failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  await paymentService.processStripeWebhook(event);
  res.json({ received: true });
});

module.exports = {
  createOrder,
  getMyOrders,
  getMyOrderDetails,
  handlePaymentWebhook,
  handleStripeWebhook,
};
