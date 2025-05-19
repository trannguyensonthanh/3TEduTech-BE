const httpStatus = require('http-status').status;
const qs = require('qs'); // Để tạo query string từ object
const paymentService = require('./payments.service');
const { catchAsync } = require('../../utils/catchAsync');
const config = require('../../config'); // Để lấy frontend URL
const ApiError = require('../../core/errors/ApiError');

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

// Controller cho IPN đã có trong orders.controller.js (handlePaymentWebhook)
// Nếu muốn tách riêng thì di chuyển logic xử lý IPN sang paymentService và tạo controller ở đây.
// Hiện tại để ở orderController vì nó liên quan mật thiết đến việc xử lý đơn hàng.

module.exports = {
  createVnpayUrl,
  handleVnpayReturn,
  // handleVnpayIpn (nếu tách riêng)
};
