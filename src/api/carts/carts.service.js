// File: carts.service.js

const httpStatus = require('http-status').status;
const { default: Decimal } = require('decimal.js');
const cartRepository = require('./carts.repository');
const courseRepository = require('../courses/courses.repository');
const enrollmentService = require('../enrollments/enrollments.service');
const ApiError = require('../../core/errors/ApiError');
const CourseStatus = require('../../core/enums/CourseStatus');
const pricingUtil = require('../../utils/pricing.util');
const logger = require('../../utils/logger');

/**
 * Lấy hoặc tạo giỏ hàng cho user.
 * @param {number} accountId
 * @returns {Promise<object>} - Cart object.
 */
const getUserCart = async (accountId) => {
  return cartRepository.findOrCreateCart(accountId);
};

/**
 * Thêm khóa học vào giỏ hàng.
 * @param {number} accountId
 * @param {number} courseId
 * @returns {Promise<object>} - CartItem mới được thêm.
 */
const addCourseToCart = async (accountId, courseId) => {
  const cart = await getUserCart(accountId);
  const course = await courseRepository.findCourseById(courseId);
  if (!course || course.StatusID !== CourseStatus.PUBLISHED) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Khóa học không tồn tại hoặc chưa được xuất bản.'
    );
  }
  if (course.InstructorID === accountId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Bạn không thể thêm khóa học của chính mình vào giỏ hàng.'
    );
  }
  const isEnrolled = await enrollmentService.isUserEnrolled(
    accountId,
    courseId
  );
  if (isEnrolled) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Bạn đã đăng ký khóa học này rồi.'
    );
  }
  const existingItem = await cartRepository.findCartItemByCourse(
    cart.CartID,
    courseId
  );
  if (existingItem) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Khóa học này đã có trong giỏ hàng.'
    );
  }
  const currentPrice = course.DiscountedPrice ?? course.OriginalPrice;
  const itemData = {
    CartID: cart.CartID,
    CourseID: courseId,
    PriceAtAddition: currentPrice,
  };
  return cartRepository.addCartItem(itemData);
};

/**
 * Xóa khóa học khỏi giỏ hàng.
 * @param {number} accountId
 * @param {number} courseId
 * @returns {Promise<void>}
 */
const removeCourseFromCart = async (accountId, courseId) => {
  const cart = await getUserCart(accountId);
  const deletedCount = await cartRepository.removeCartItemByCourse(
    cart.CartID,
    courseId
  );
  if (deletedCount === 0) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Không tìm thấy khóa học này trong giỏ hàng.'
    );
  }
};

/**
 * Xem chi tiết giỏ hàng của người dùng.
 * @param {number} accountId
 * @param {string} targetCurrency - Mã tiền tệ muốn hiển thị giá (ví dụ: 'USD', 'VND').
 * @returns {Promise<{items: object[], totalOriginalPrice: number, totalDiscountedPrice: number, finalPrice: number}>}
 */
const viewCart = async (accountId, targetCurrency) => {
  const cart = await getUserCart(accountId);
  const itemsFromRepo = await cartRepository.findCartItemsByCartId(cart.CartID);

  let totalOriginalPrice = new Decimal(0);
  let finalPrice = new Decimal(0);
  const itemsWithPricing = await Promise.all(
    itemsFromRepo.map(async (item) => {
      const itemAsCourse = {
        OriginalPrice: item.OriginalPrice,
        DiscountedPrice: item.DiscountedPrice,
      };
      const pricing = await pricingUtil.createPricingObject(
        itemAsCourse,
        targetCurrency
      );
      totalOriginalPrice = totalOriginalPrice.plus(
        pricing.display.originalPrice
      );
      finalPrice = finalPrice.plus(
        pricing.display.discountedPrice ?? pricing.display.originalPrice
      );
      return {
        cartItemId: item.CartItemID,
        courseId: item.CourseID,
        courseName: item.CourseName,
        slug: item.Slug,
        thumbnailUrl: item.ThumbnailUrl,
        instructorName: item.InstructorName,
        addedAt: item.AddedAt,
        pricing,
      };
    })
  );

  const totalDiscount = totalOriginalPrice.minus(finalPrice);
  const displayCurrency =
    itemsWithPricing.length > 0
      ? itemsWithPricing[0].pricing.display.currency
      : targetCurrency;

  return {
    cartId: cart.CartID,
    items: itemsWithPricing,
    summary: {
      currency: displayCurrency,
      totalOriginalPrice: totalOriginalPrice.toDP(2).toNumber(),
      totalDiscount: totalDiscount.toDP(2).toNumber(),
      finalPrice: finalPrice.toDP(2).toNumber(),
      itemCount: itemsWithPricing.length,
    },
  };
};

/**
 * Xóa toàn bộ sản phẩm trong giỏ hàng của người dùng.
 * @param {number} accountId
 * @returns {Promise<void>}
 */
const clearMyCart = async (accountId) => {
  const cart = await getUserCart(accountId);
  const deletedCount = await cartRepository.clearCart(cart.CartID);
  logger.info(
    `Cleared ${deletedCount} items from cart ${cart.CartID} for user ${accountId}.`
  );
};

module.exports = {
  getUserCart,
  addCourseToCart,
  removeCourseFromCart,
  viewCart,
  clearMyCart,
};
