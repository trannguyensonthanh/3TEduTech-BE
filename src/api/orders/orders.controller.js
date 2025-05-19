const httpStatus = require('http-status').status;
const orderService = require('./orders.service');
const { catchAsync } = require('../../utils/catchAsync');
const { pick } = require('../../utils/pick');
const OrderStatus = require('../../core/enums/OrderStatus');
const paymentService = require('../payments/payments.service');
const logger = require('../../utils/logger');

const createOrder = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const options = pick(req.body, ['promotionCode']); // Lấy promotionCode
  const order = await orderService.createOrderFromCart(accountId, options); // Truyền options vào service
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

module.exports = {
  createOrder,
  getMyOrders,
  getMyOrderDetails,
  handlePaymentWebhook, // Controller cho webhook
};
