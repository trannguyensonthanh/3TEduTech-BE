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
const validatePromotionCode = catchAsync(async (req, res) => {
  const { promotionCode } = req.body;
  const accountId = req.user.id;
  const cartDetails = await cartService.viewCart(accountId, req.targetCurrency);
  const orderTotal = cartDetails.summary.finalPrice;

  const validationResult = await promotionService.validateAndApplyPromotion(
    promotionCode,
    orderTotal
  );

  res.status(httpStatus.OK).send({
    isValid: true,
    discountAmount: validationResult.discountAmount,
    promotionId: validationResult.promotionId,
    message: `Mã hợp lệ. Bạn được giảm ${validationResult.discountAmount}.`,
  });
});

const deletePromotion = catchAsync(async (req, res) => {
  await promotionService.deletePromotion(req.params.promotionId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createPromotion,
  getPromotions,
  getPromotion,
  updatePromotion,
  deactivatePromotion,
  validatePromotionCode,
  deletePromotion,
};
