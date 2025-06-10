const httpStatus = require('http-status').status;
const qs = require('qs'); // Để tạo query string từ object
const paymentService = require('./payments.service');
const { catchAsync } = require('../../utils/catchAsync');
const config = require('../../config'); // Để lấy frontend URL
const ApiError = require('../../core/errors/ApiError');
const logger = require('../../utils/logger');
const stripe = require('../../config/stripe');

// Để sử dụng Stripe SDK
const createVnpayUrl = catchAsync(async (req, res) => {
  const { orderId, bankCode, locale } = req.body;
  // Lấy IP từ request (cần cấu hình Express để tin tưởng proxy nếu có)
  const ipAddr =
    req.headers['x-forwarded-for'] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    (req.connection.socket ? req.connection.socket.remoteAddress : null);

  if (!ipAddr) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Không thể xác định địa chỉ IP.'
    );
  }
  // Lấy địa chỉ IP đầu tiên nếu có nhiều IP trong x-forwarded-for
  const clientIp = ipAddr.split(',')[0].trim();

  const paymentUrl = await paymentService.createVnpayUrl(
    orderId,
    clientIp,
    bankCode,
    locale
  );
  res.status(httpStatus.OK).send({ paymentUrl });
});

const handleVnpayReturn = catchAsync(async (req, res) => {
  const vnpParams = req.query;
  const result = await paymentService.processVnpayReturn(vnpParams);

  // Chuyển hướng người dùng về trang kết quả của Frontend kèm theo thông tin
  // Ví dụ: redirect về trang /payment/result?status=success&orderId=...&message=...
  const frontendResultUrl = `${
    config.frontendUrl || 'http://localhost:8080'
  }/payment/result`; // Cần thêm frontendUrl vào config
  const queryResult = {
    vnp_ResponseCode: result.code,
    orderId: result.orderId,
    message: encodeURIComponent(result.message), // Encode message để tránh lỗi URL
    // Thêm các tham số khác nếu cần
  };
  const redirectUrl = `${frontendResultUrl}?${qs.stringify(queryResult)}`;

  res.redirect(redirectUrl);
});

const createStripeCheckoutSession = catchAsync(async (req, res) => {
  const { orderId } = req.body;
  const accountId = req.user.id;
  const sessionData = await paymentService.createStripeCheckoutSession(
    orderId,
    accountId
  );
  res.status(httpStatus.OK).send(sessionData);
});

const createCryptoInvoice = catchAsync(async (req, res) => {
  const { orderId, cryptoCurrency } = req.body;
  const accountId = req.user.id;

  const invoiceDetails = await paymentService.createCryptoInvoice(
    orderId,
    cryptoCurrency,
    accountId
  );
  res.status(httpStatus.CREATED).send(invoiceDetails);
});

const handleCryptoWebhook = catchAsync(async (req, res) => {
  const signature = req.headers['x-nowpayments-sig'];
  const rawBody = req.body;

  if (!rawBody || rawBody.length === 0 || !signature) {
    logger.error(
      'Crypto Webhook Error: Received empty body or missing signature.'
    );
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid webhook request.');
  }

  await paymentService.processCryptoWebhook(signature, rawBody);

  res.status(httpStatus.OK).send();
});

module.exports = {
  createVnpayUrl,
  handleVnpayReturn,
  createStripeCheckoutSession,
  createCryptoInvoice,
  handleCryptoWebhook,
};
