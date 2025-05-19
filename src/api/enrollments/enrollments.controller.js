// File: src/api/enrollments/enrollments.controller.js

const httpStatus = require('http-status').status;
const enrollmentService = require('./enrollments.service');
const courseRepository = require('../courses/courses.repository'); // Cần để lấy giá gốc nếu cần
const { catchAsync } = require('../../utils/catchAsync');
const { pick } = require('../../utils/pick');
const ApiError = require('../../core/errors/ApiError');

/**
 * Controller để user tự đăng ký (ví dụ: khóa học miễn phí hoặc test).
 * Trong thực tế, việc tạo enrollment thường do luồng thanh toán xử lý.
 */
const enrollInCourse = catchAsync(async (req, res) => {
  const accountId = req.user.id; // Lấy từ middleware authenticate
  const { courseId } = req.params;

  // Lấy giá khóa học hiện tại (hoặc = 0 nếu là miễn phí)
  // Logic xác định giá cần phức tạp hơn trong thực tế (xem có discount không)
  const course = await courseRepository.findCourseById(courseId);
  if (!course)
    throw new ApiError(httpStatus.NOT_FOUND, 'Khóa học không tồn tại.');
  const purchasePrice = course.DiscountedPrice ?? course.OriginalPrice ?? 0;

  // Chỉ cho enroll vào khóa học miễn phí qua API này? (Tùy quy định)
  if (purchasePrice > 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Khóa học này cần thanh toán. Vui lòng thêm vào giỏ hàng.'
    );
  }

  const enrollment = await enrollmentService.createEnrollment(
    accountId,
    courseId,
    purchasePrice
  );
  res.status(httpStatus.CREATED).send(enrollment);
});

const getMyEnrollments = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const options = pick(req.query, ['limit', 'page']);
  const result = await enrollmentService.getMyEnrollments(accountId, options);
  res.status(httpStatus.OK).send(result);
});

module.exports = {
  enrollInCourse,
  getMyEnrollments,
};
