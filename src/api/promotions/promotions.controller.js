const httpStatus = require('http-status').status;
const promotionService = require('./promotions.service');
const { catchAsync } = require('../../utils/catchAsync');
const { pick } = require('../../utils/pick');
const cartService = require('../carts/carts.service');
// --- Admin Controllers ---
const createPromotion = catchAsync(async (req, res) => {
  const promotion = await promotionService.createPromotion(req.body);
  res.status(httpStatus.CREATED).send(promotion);
});

const getPromotions = catchAsync(async (req, res) => {
  const filters = pick(req.query, ['status']);
  const options = pick(req.query, ['limit', 'page', 'sortBy']);
  const result = await promotionService.getPromotions(filters, options);
  res.status(httpStatus.OK).send(result);
});

const getPromotion = catchAsync(async (req, res) => {
  const promotion = await promotionService.getPromotion(req.params.promotionId);
  res.status(httpStatus.OK).send(promotion);
});

const updatePromotion = catchAsync(async (req, res) => {
  const promotion = await promotionService.updatePromotion(
    req.params.promotionId,
    req.body
  );
  res.status(httpStatus.OK).send(promotion);
});

const deactivatePromotion = catchAsync(async (req, res) => {
  await promotionService.deactivatePromotion(req.params.promotionId);
  res.status(httpStatus.OK).send({ message: 'Đã hủy kích hoạt mã giảm giá.' });
});

// --- Có thể thêm Controller cho User/Public ---
// Ví dụ: Validate mã giảm giá cho giỏ hàng hiện tại
const validatePromotionCode = catchAsync(async (req, res) => {
  const { promotionCode } = req.body;
  // Cần lấy tổng tiền giỏ hàng hiện tại của user
  const accountId = req.user.id;
  const cartDetails = await cartService.viewCart(accountId);
  const orderTotal = cartDetails.summary.finalPrice; // Dùng final price của cart

  // Chỉ validate, không áp dụng ngay
  const validationResult = await promotionService.validateAndApplyPromotion(
    promotionCode,
    orderTotal
  );

  // Trả về thông tin giảm giá nếu hợp lệ
  res.status(httpStatus.OK).send({
    isValid: true,
    discountAmount: validationResult.discountAmount,
    promotionId: validationResult.promotionId,
    message: `Mã hợp lệ. Bạn được giảm ${validationResult.discountAmount}.`,
  });
  // Nếu không hợp lệ, service sẽ throw ApiError, middleware lỗi sẽ bắt
});

module.exports = {
  // Admin
  createPromotion,
  getPromotions,
  getPromotion,
  updatePromotion,
  deactivatePromotion,
  // User/Public (Optional)
  validatePromotionCode,
};
