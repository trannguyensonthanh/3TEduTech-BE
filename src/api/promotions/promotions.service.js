const httpStatus = require('http-status').status;
const moment = require('moment-timezone');
const promotionRepository = require('./promotions.repository');
const ApiError = require('../../core/errors/ApiError');
const PromotionStatus = require('../../core/enums/PromotionStatus');
const logger = require('../../utils/logger');
const orderRepository = require('../orders/orders.repository');
const { toCamelCaseObject } = require('../../utils/caseConverter');

/**
 * Xác định trạng thái promotion dựa trên ngày và trạng thái hiện tại.
 * @param {object} promotion
 * @returns {string} - Trạng thái mới (ACTIVE, INACTIVE, EXPIRED).
 */
const determinePromotionStatus = (promotion) => {
  const now = moment();
  const startDate = moment(promotion.StartDate);
  const endDate = moment(promotion.EndDate);
  if (promotion.Status === PromotionStatus.INACTIVE) {
    return PromotionStatus.INACTIVE;
  }
  if (now.isAfter(endDate)) {
    return PromotionStatus.EXPIRED;
  }
  if (now.isBefore(startDate)) {
    return PromotionStatus.INACTIVE;
  }
  return PromotionStatus.ACTIVE;
};

const createPromotion = async (promoData) => {
  const existingCode = await promotionRepository.findPromotionByCode(
    promoData.discountCode
  );
  if (existingCode) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Mã giảm giá đã tồn tại.');
  }

  if (
    promoData.discountType === 'PERCENTAGE' &&
    (promoData.discountValue <= 0 || promoData.discountValue > 100)
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Giá trị % giảm giá phải từ 0 đến 100.'
    );
  }
  if (
    promoData.discountType === 'FIXED_AMOUNT' &&
    promoData.discountValue <= 0
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Số tiền giảm giá cố định phải lớn hơn 0.'
    );
  }
  if (promoData.maxDiscountAmount !== null && promoData.maxDiscountAmount < 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Giới hạn giảm giá tối đa không được âm.'
    );
  }
  if (promoData.minOrderValue !== null && promoData.minOrderValue < 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Giá trị đơn hàng tối thiểu không được âm.'
    );
  }

  const dataToSave = {
    DiscountCode: promoData.discountCode,
    PromotionName: promoData.promotionName,
    Description: promoData.description,
    DiscountType: promoData.discountType,
    DiscountValue: promoData.discountValue,
    MinOrderValue: promoData.minOrderValue,
    MaxDiscountAmount: promoData.maxDiscountAmount,
    StartDate: promoData.startDate,
    EndDate: promoData.endDate,
    MaxUsageLimit: promoData.maxUsageLimit,
    Status: promoData.status || PromotionStatus.INACTIVE,
  };

  if (dataToSave.Status === PromotionStatus.ACTIVE) {
    const autoStatus = determinePromotionStatus(dataToSave);
    dataToSave.Status =
      autoStatus === PromotionStatus.ACTIVE
        ? PromotionStatus.ACTIVE
        : PromotionStatus.INACTIVE;
  }

  return promotionRepository.createPromotion(dataToSave);
};

const getPromotions = async (filters, options) => {
  const { page = 1, limit = 10 } = options;
  const result = await promotionRepository.findAllPromotions(filters, options);
  return {
    promotions: toCamelCaseObject(result.promotions),
    total: result.total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalPages: Math.ceil(result.total / limit),
  };
};

const getPromotion = async (promotionId) => {
  const promotion = await promotionRepository.findPromotionById(promotionId);
  if (!promotion) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy mã giảm giá.');
  }
  return toCamelCaseObject(promotion);
};

const updatePromotion = async (promotionId, updateData) => {
  const promotion = await getPromotion(promotionId);

  if (
    updateData.discountCode &&
    updateData.discountCode !== promotion.DiscountCode
  ) {
    const existingCode = await promotionRepository.findPromotionByCode(
      updateData.discountCode
    );
    if (existingCode && existingCode.PromotionID !== promotionId) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Mã giảm giá đã tồn tại.');
    }
  }

  const tempPromoData = { ...promotion, ...updateData };
  if (
    tempPromoData.discountType === 'PERCENTAGE' &&
    (tempPromoData.discountValue <= 0 || tempPromoData.discountValue > 100)
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Giá trị % giảm giá phải từ 0 đến 100.'
    );
  }
  if (
    tempPromoData.discountType === 'FIXED_AMOUNT' &&
    tempPromoData.discountValue <= 0
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Số tiền giảm giá cố định phải lớn hơn 0.'
    );
  }
  if (
    tempPromoData.maxDiscountAmount !== null &&
    tempPromoData.maxDiscountAmount < 0
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Giới hạn giảm giá tối đa không được âm.'
    );
  }
  if (tempPromoData.minOrderValue !== null && tempPromoData.minOrderValue < 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Giá trị đơn hàng tối thiểu không được âm.'
    );
  }

  if (updateData.status || updateData.startDate || updateData.endDate) {
    const potentialStatus = updateData.status || tempPromoData.Status;
    const effectiveStatus = determinePromotionStatus(tempPromoData);

    if (potentialStatus === PromotionStatus.ACTIVE) {
      if (effectiveStatus === PromotionStatus.ACTIVE) {
        updateData.Status = PromotionStatus.ACTIVE;
      } else if (effectiveStatus === PromotionStatus.EXPIRED) {
        updateData.Status = PromotionStatus.EXPIRED;
      } else {
        updateData.Status = PromotionStatus.INACTIVE;
      }
    } else {
      updateData.Status = potentialStatus;
    }
  }

  return promotionRepository.updatePromotionById(promotionId, updateData);
};

/**
 * Hủy kích hoạt một promotion.
 * @param {number} promotionId
 * @returns {Promise<object>}
 */
const deactivatePromotion = async (promotionId) => {
  await getPromotion(promotionId);
  return promotionRepository.updatePromotionStatus(
    promotionId,
    PromotionStatus.INACTIVE
  );
};

/**
 * Kiểm tra và áp dụng mã giảm giá cho một tổng tiền đơn hàng.
 * @param {string} promotionCode
 * @param {number} orderTotal - Tổng giá trị đơn hàng (trước khi áp dụng mã này).
 * @returns {Promise<{discountAmount: number, promotionId: number}>} - Số tiền giảm và ID của promotion.
 */
const validateAndApplyPromotion = async (promotionCode, orderTotal) => {
  const promotion =
    await promotionRepository.findPromotionByCode(promotionCode);

  if (!promotion) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Mã giảm giá không hợp lệ.');
  }
  const effectiveStatus = determinePromotionStatus(promotion);
  if (effectiveStatus !== PromotionStatus.ACTIVE) {
    if (effectiveStatus === PromotionStatus.EXPIRED)
      throw new ApiError(httpStatus.BAD_REQUEST, 'Mã giảm giá đã hết hạn.');
    else
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Mã giảm giá không hợp lệ hoặc chưa được kích hoạt.'
      );
  }

  if (promotion.Status !== PromotionStatus.ACTIVE) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Mã giảm giá không được kích hoạt.'
    );
  }

  if (
    promotion.MaxUsageLimit !== null &&
    promotion.UsageCount >= promotion.MaxUsageLimit
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Mã giảm giá đã hết lượt sử dụng.'
    );
  }

  if (
    promotion.MinOrderValue !== null &&
    orderTotal < promotion.MinOrderValue
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Đơn hàng tối thiểu ${promotion.MinOrderValue} để áp dụng mã này.`
    );
  }

  let discountAmount = 0;
  if (promotion.DiscountType === 'PERCENTAGE') {
    discountAmount = orderTotal * (promotion.DiscountValue / 100);
    if (
      promotion.MaxDiscountAmount !== null &&
      discountAmount > promotion.MaxDiscountAmount
    ) {
      discountAmount = promotion.MaxDiscountAmount;
    }
  } else if (promotion.DiscountType === 'FIXED_AMOUNT') {
    discountAmount = promotion.DiscountValue;
  }

  discountAmount = Math.min(discountAmount, orderTotal);
  discountAmount = Math.max(0, discountAmount);

  logger.info(
    `Promotion ${promotionCode} validated. Discount: ${discountAmount} for order total ${orderTotal}`
  );

  return {
    discountAmount,
    promotionId: promotion.PromotionID,
  };
};

/**
 * Tăng số lượt sử dụng của mã giảm giá.
 * @param {number} promotionId
 * @param {object} [transaction=null]
 * @returns {Promise<boolean>} - True nếu thành công.
 */
const incrementUsageCount = async (promotionId, transaction = null) => {
  const success = await promotionRepository.incrementUsageCount(
    promotionId,
    transaction
  );
  if (!success) {
    logger.error(
      `Failed to increment usage count for promotion ${promotionId}. Limit might have been reached.`
    );
    throw new ApiError(httpStatus.CONFLICT, 'Lượt sử dụng mã giảm giá đã hết.');
  }
  return success;
};

/**
 * Admin xóa một mã giảm giá.
 * @param {number} promotionId
 * @returns {Promise<void>}
 */
const deletePromotion = async (promotionId) => {
  const promotion = await getPromotion(promotionId);

  const usageInOrders =
    await orderRepository.countOrdersByPromotionId(promotionId);
  if (usageInOrders > 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Không thể xóa mã giảm giá này vì nó đã được áp dụng cho ${usageInOrders} đơn hàng. Vui lòng hủy kích hoạt (deactivate) mã này thay vì xóa.`
    );
  }

  await promotionRepository.deletePromotionById(promotionId);

  logger.info(
    `Promotion ${promotionId} (${promotion.DiscountCode}) has been deleted.`
  );
};

module.exports = {
  createPromotion,
  getPromotions,
  getPromotion,
  updatePromotion,
  deactivatePromotion,
  validateAndApplyPromotion,
  incrementUsageCount,
  deletePromotion,
  determinePromotionStatus,
};
