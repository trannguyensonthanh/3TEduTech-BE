const httpStatus = require('http-status').status;
const qs = require('qs');
const paymentService = require('./payments.service');
const { catchAsync } = require('../../utils/catchAsync');
const config = require('../../config');
const ApiError = require('../../core/errors/ApiError');
const logger = require('../../utils/logger');
const stripe = require('../../config/stripe');

// Để sử dụng Stripe SDK
const createVnpayUrl = catchAsync(async (req, res) => {
  const { orderId, bankCode, locale } = req.body;
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
  const clientIp = ipAddr.split(',')[0].trim();

  const paymentUrl = await paymentService.createVnpayUrl(
    orderId,
    clientIp,
    bankCode,
    locale
  );
  res.status(httpStatus.OK).send({ paymentUrl });
});

// Chuyển hướng người dùng về trang kết quả của Frontend kèm theo thông tin
const handleVnpayReturn = catchAsync(async (req, res) => {
  const vnpParams = req.query;
  const result = await paymentService.processVnpayReturn(vnpParams);

  const frontendResultUrl = `${
    config.frontendUrl || 'http://localhost:8080'
  }/payment/result`;
  const queryResult = {
    vnp_ResponseCode: result.code,
    orderId: result.orderId,
    message: encodeURIComponent(result.message),
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

const createPayPalOrder = catchAsync(async (req, res) => {
  const { orderId } = req.body;
  const accountId = req.user.id;
  const payPalOrder = await paymentService.createPayPalOrder(
    orderId,
    accountId
  );
  res.status(httpStatus.CREATED).send(payPalOrder);
});

const capturePayPalOrder = catchAsync(async (req, res) => {
  const { orderId, internalOrderId } = req.body;
  const accountId = req.user.id;
  const result = await paymentService.capturePayPalPayment(
    orderId,
    internalOrderId,
    accountId
  );
  res.status(httpStatus.OK).send(result);
});

const createMomoPaymentUrl = catchAsync(async (req, res) => {
  const { orderId } = req.body;
  const accountId = req.user.id;
  const result = await paymentService.createMomoPaymentUrl(orderId, accountId);
  res.status(httpStatus.OK).send(result);
});

// MoMo yêu cầu response rỗng với status 204 No Content sau khi xử lý thành công
const handleMomoWebhook = catchAsync(async (req, res) => {
  await paymentService.processMomoWebhook(req.body);
  res.status(204).send();
});

module.exports = {
  createVnpayUrl,
  handleVnpayReturn,
  createStripeCheckoutSession,
  createCryptoInvoice,
  handleCryptoWebhook,
  createPayPalOrder,
  capturePayPalOrder,
  createMomoPaymentUrl,
  handleMomoWebhook,
};
