const httpStatus = require('http-status').status;
const orderService = require('./orders.service');
const { catchAsync } = require('../../utils/catchAsync');
const { pick } = require('../../utils/pick');
const OrderStatus = require('../../core/enums/OrderStatus');
const paymentService = require('../payments/payments.service');
const logger = require('../../utils/logger');
const config = require('../../config');
const stripe = require('../../config/stripe');

const createOrder = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const options = {
    promotionCode: req.body.promotionCode,
    currency: req.targetCurrency,
  };
  const order = await orderService.createOrderFromCart(accountId, options);
  res.status(httpStatus.CREATED).send(order);
});

const getMyOrders = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const options = pick(req.query, ['limit', 'page', 'status']);
  const result = await orderService.getMyOrders(accountId, options);
  res.status(httpStatus.OK).send(result);
});

const getMyOrderDetails = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const { orderId } = req.params;
  const orderDetails = await orderService.getMyOrderDetails(accountId, orderId);
  res.status(httpStatus.OK).send(orderDetails);
});

// --- Callback/Webhook (Ví dụ - Sẽ cần điều chỉnh theo cổng thanh toán) ---
// Cần có cơ chế bảo mật webhook (signature verification)
const handlePaymentWebhook = catchAsync(async (req, res) => {
  // VNPay IPN dùng GET, tham số nằm trong req.query
  const vnpParams = req.query;
  logger.info('Received VNPay IPN:', vnpParams);

  // Gọi service để xử lý logic IPN
  const result = await paymentService.processVnpayIpn(vnpParams);

  // Phản hồi lại cho VNPay server theo tài liệu
  // Quan trọng: Phải trả về đúng định dạng VNPay yêu cầu để họ không gửi lại IPN
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
    // req.body ở đây là raw buffer nhờ express.raw()
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      config.stripe.webhookSecret
    );
  } catch (err) {
    logger.error(`⚠️  Webhook signature verification failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Xử lý sự kiện
  await paymentService.processStripeWebhook(event);

  // Trả về response 200 để báo cho Stripe đã nhận
  res.json({ received: true });
});

module.exports = {
  createOrder,
  getMyOrders,
  getMyOrderDetails,
  handlePaymentWebhook, // Controller cho webhook
  handleStripeWebhook,
};
