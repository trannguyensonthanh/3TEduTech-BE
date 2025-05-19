// File: carts.service.js

const httpStatus = require('http-status').status;
const cartRepository = require('./carts.repository');
const courseRepository = require('../courses/courses.repository'); // Lấy thông tin khóa học
const enrollmentService = require('../enrollments/enrollments.service'); // Kiểm tra đã enroll chưa
const ApiError = require('../../core/errors/ApiError');
const CourseStatus = require('../../core/enums/CourseStatus');

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

  // 1. Kiểm tra khóa học tồn tại, đã publish và user chưa đăng ký
  const course = await courseRepository.findCourseById(courseId); // Chỉ lấy published
  if (!course || course.StatusID !== CourseStatus.PUBLISHED) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Khóa học không tồn tại hoặc chưa được xuất bản.'
    );
  }
  // Kiểm tra nếu user là instructor của khóa học này -> không cho mua
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

  // 2. Kiểm tra item đã có trong giỏ chưa (repository sẽ báo lỗi unique, nhưng check trước vẫn tốt)
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

  // 3. Lấy giá hiện tại để lưu vào CartItem
  const currentPrice = course.DiscountedPrice ?? course.OriginalPrice;

  // 4. Thêm item
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
 * @returns {Promise<{items: object[], totalOriginalPrice: number, totalDiscountedPrice: number, finalPrice: number}>}
 */
const viewCart = async (accountId) => {
  const cart = await getUserCart(accountId);
  const items = await cartRepository.findCartItemsByCartId(cart.CartID);

  let totalOriginalPrice = 0;
  let finalPrice = 0;

  // Tính toán tổng giá dựa trên giá *hiện tại* của khóa học (không phải giá lúc thêm)
  // Giá lúc thêm (PriceAtAddition) chỉ để tham khảo hoặc xử lý nếu giá thay đổi
  items.forEach((item) => {
    totalOriginalPrice += item.OriginalPrice || 0;
    finalPrice += (item.DiscountedPrice ?? item.OriginalPrice) || 0; // Ưu tiên giá giảm
  });

  const totalDiscount = totalOriginalPrice - finalPrice;

  return {
    cartId: cart.CartID,
    items: items.map((item) => ({
      // Có thể format lại dữ liệu trả về
      cartItemId: item.CartItemID,
      courseId: item.CourseID,
      courseName: item.CourseName,
      slug: item.Slug,
      thumbnailUrl: item.ThumbnailUrl,
      instructorName: item.InstructorName,
      currentPrice: item.DiscountedPrice ?? item.OriginalPrice, // Giá hiện tại
      originalPrice: item.OriginalPrice, // Giá gốc
      priceAtAddition: item.PriceAtAddition, // Giá lúc thêm
      addedAt: item.AddedAt,
    })),
    summary: {
      totalOriginalPrice,
      totalDiscount, // Tính tổng giảm giá dựa trên giá hiện tại
      finalPrice, // Tổng tiền cuối cùng (chưa áp dụng mã giảm giá)
      itemCount: items.length,
    },
  };
};

module.exports = {
  getUserCart, // Có thể không cần export ra controller
  addCourseToCart,
  removeCourseFromCart,
  viewCart,
};
