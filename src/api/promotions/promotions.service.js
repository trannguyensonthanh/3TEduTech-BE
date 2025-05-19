const httpStatus = require('http-status').status;
const moment = require('moment-timezone');
const promotionRepository = require('./promotions.repository');
const ApiError = require('../../core/errors/ApiError');
const PromotionStatus = require('../../core/enums/PromotionStatus');
const logger = require('../../utils/logger');

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
    return PromotionStatus.INACTIVE; // Nếu admin đã tắt thì giữ nguyên INACTIVE
  }
  if (now.isAfter(endDate)) {
    return PromotionStatus.EXPIRED;
  }
  if (now.isBefore(startDate)) {
    return PromotionStatus.INACTIVE; // Chưa tới ngày, coi là INACTIVE
  }
  // Nếu nằm trong khoảng thời gian và không phải INACTIVE/EXPIRED
  return PromotionStatus.ACTIVE;
};

const createPromotion = async (promoData) => {
  // 1. Kiểm tra code tồn tại
  const existingCode = await promotionRepository.findPromotionByCode(
    promoData.discountCode
  );
  if (existingCode) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Mã giảm giá đã tồn tại.');
  }

  // 2. Validate giá trị discount dựa trên type
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
  // Đảm bảo MaxDiscountAmount >= 0 nếu có
  if (promoData.maxDiscountAmount !== null && promoData.maxDiscountAmount < 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Giới hạn giảm giá tối đa không được âm.'
    );
  }
  // Đảm bảo MinOrderValue >= 0 nếu có
  if (promoData.minOrderValue !== null && promoData.minOrderValue < 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Giá trị đơn hàng tối thiểu không được âm.'
    );
  }

  // 3. Chuẩn bị dữ liệu để lưu
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
    Status: promoData.status || PromotionStatus.INACTIVE, // Admin có thể set trạng thái ban đầu
  };

  // Tự động xác định trạng thái nếu admin không set hoặc set là ACTIVE
  if (dataToSave.Status === PromotionStatus.ACTIVE) {
    const autoStatus = determinePromotionStatus(dataToSave);
    // Chỉ cho phép ACTIVE nếu thực sự hợp lệ theo ngày
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
  // Có thể cập nhật trạng thái dựa trên ngày hiện tại trước khi trả về?
  // result.promotions.forEach(p => p.CurrentEffectiveStatus = determinePromotionStatus(p));
  return {
    promotions: result.promotions,
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
  // promotion.CurrentEffectiveStatus = determinePromotionStatus(promotion); // Thêm trạng thái hiệu lực hiện tại
  return promotion;
};

const updatePromotion = async (promotionId, updateData) => {
  const promotion = await getPromotion(promotionId); // Check existence

  // Kiểm tra trùng code nếu code được cập nhật
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

  // Validate các giá trị nếu chúng được cập nhật
  const tempPromoData = { ...promotion, ...updateData }; // Dữ liệu giả định sau khi update
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

  // Xác định lại Status nếu ngày hoặc status được thay đổi
  if (updateData.status || updateData.startDate || updateData.endDate) {
    const potentialStatus = updateData.status || tempPromoData.Status; // Ưu tiên status admin set
    const effectiveStatus = determinePromotionStatus(tempPromoData);

    // Chỉ cho phép admin set ACTIVE nếu ngày hợp lệ, nếu không tự chuyển về INACTIVE/EXPIRED
    if (potentialStatus === PromotionStatus.ACTIVE) {
      if (effectiveStatus === PromotionStatus.ACTIVE) {
        updateData.Status = PromotionStatus.ACTIVE;
      } else if (effectiveStatus === PromotionStatus.EXPIRED) {
        updateData.Status = PromotionStatus.EXPIRED;
      } else {
        updateData.Status = PromotionStatus.INACTIVE;
      }
    } else {
      updateData.Status = potentialStatus; // Giữ nguyên INACTIVE/EXPIRED nếu admin muốn set
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
  await getPromotion(promotionId); // Check existence
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

  // 1. Check existence
  if (!promotion) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Mã giảm giá không hợp lệ.');
  }

  // 2. Check status (dựa trên trạng thái hiệu lực thực tế)
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

  // Check status lưu trong DB (phòng trường hợp admin tắt thủ công)
  if (promotion.Status !== PromotionStatus.ACTIVE) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Mã giảm giá không được kích hoạt.'
    );
  }

  // 3. Check usage limit
  if (
    promotion.MaxUsageLimit !== null &&
    promotion.UsageCount >= promotion.MaxUsageLimit
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Mã giảm giá đã hết lượt sử dụng.'
    );
  }

  // 4. Check minimum order value
  if (
    promotion.MinOrderValue !== null &&
    orderTotal < promotion.MinOrderValue
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Đơn hàng tối thiểu ${promotion.MinOrderValue} để áp dụng mã này.`
    );
  }

  // 5. Calculate discount
  let discountAmount = 0;
  if (promotion.DiscountType === 'PERCENTAGE') {
    discountAmount = orderTotal * (promotion.DiscountValue / 100);
    // Apply max discount amount cap
    if (
      promotion.MaxDiscountAmount !== null &&
      discountAmount > promotion.MaxDiscountAmount
    ) {
      discountAmount = promotion.MaxDiscountAmount;
    }
  } else if (promotion.DiscountType === 'FIXED_AMOUNT') {
    discountAmount = promotion.DiscountValue;
  }

  // Ensure discount doesn't exceed order total
  discountAmount = Math.min(discountAmount, orderTotal);
  discountAmount = Math.max(0, discountAmount); // Ensure non-negative

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
    // Điều này có thể xảy ra do race condition (lượt cuối cùng được dùng bởi request khác)
    logger.error(
      `Failed to increment usage count for promotion ${promotionId}. Limit might have been reached.`
    );
    // Nên throw lỗi để rollback transaction tạo order?
    throw new ApiError(httpStatus.CONFLICT, 'Lượt sử dụng mã giảm giá đã hết.');
  }
  return success;
};

module.exports = {
  createPromotion,
  getPromotions,
  getPromotion,
  updatePromotion,
  deactivatePromotion,
  validateAndApplyPromotion,
  incrementUsageCount,
};
