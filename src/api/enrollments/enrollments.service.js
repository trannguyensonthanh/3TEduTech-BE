// File: src/api/enrollments/enrollments.service.js

const httpStatus = require('http-status').status;
const enrollmentRepository = require('./enrollments.repository');
const courseRepository = require('../courses/courses.repository');
const ApiError = require('../../core/errors/ApiError');
const CourseStatus = require('../../core/enums/CourseStatus');
const logger = require('../../utils/logger');
const notificationService = require('../notifications/notifications.service');
const { toCamelCaseObject } = require('../../utils/caseConverter');

/**
 * Tạo đăng ký mới cho người dùng vào khóa học (ví dụ: sau khi thanh toán thành công).
 * @param {number} accountId - ID người dùng đăng ký.
 * @param {number} courseId - ID khóa học.
 * @param {number} purchasePrice - Giá mua tại thời điểm đăng ký.
 * @param {object} [transaction=null] - Transaction nếu đang trong luồng thanh toán.
 * @returns {Promise<object>} - Bản ghi enrollment mới.
 */
const createEnrollment = async (
  accountId,
  courseId,
  purchasePrice,
  transaction = null
) => {
  const course = await courseRepository.findCourseById(courseId);
  if (!course || course.StatusID !== CourseStatus.PUBLISHED) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Khóa học không tồn tại hoặc chưa được xuất bản.'
    );
  }

  const existingEnrollment =
    await enrollmentRepository.findEnrollmentByUserAndCourse(
      accountId,
      courseId
    );
  if (existingEnrollment) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Bạn đã đăng ký khóa học này rồi.'
    );
  }

  const enrollmentData = {
    AccountID: accountId,
    CourseID: courseId,
    PurchasePrice: purchasePrice,
  };

  const newEnrollment = await enrollmentRepository.createEnrollment(
    enrollmentData,
    transaction
  );

  if (!newEnrollment) {
    logger.warn(
      `Duplicate enrollment detected during creation for user ${accountId}, course ${courseId}`
    );
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Bạn đã đăng ký khóa học này rồi.'
    );
  }

  logger.info(`User ${accountId} enrolled in course ${courseId} successfully.`);
  try {
    const course = await courseRepository.findCourseById(courseId);
    const message = `Chúc mừng bạn đã đăng ký thành công khóa học "${
      course?.CourseName || ''
    }"!`;
    await notificationService.createNotification(
      accountId,
      'COURSE_ENROLLED',
      message,
      { type: 'Course', id: courseId }
    );
  } catch (notifyError) {
    logger.error(
      `Failed to send enrollment notification for user ${accountId}, course ${courseId}:`,
      notifyError
    );
  }
  return newEnrollment;
};

/**
 * Kiểm tra xem người dùng đã đăng ký khóa học chưa.
 * @param {number} accountId
 * @param {number} courseId
 * @returns {Promise<boolean>}
 */
const isUserEnrolled = async (accountId, courseId) => {
  const enrollment = await enrollmentRepository.findEnrollmentByUserAndCourse(
    accountId,
    courseId
  );
  return !!enrollment;
};

/**
 * Lấy danh sách khóa học đã đăng ký của người dùng.
 * @param {number} accountId
 * @param {object} options - { page, limit }
 * @returns {Promise<object>} - { enrollments, total, page, limit, totalPages }
 */
const getMyEnrollments = async (accountId, options) => {
  const { page = 1, limit = 10 } = options;
  const { enrollments, total } =
    await enrollmentRepository.findEnrollmentsByAccountId(accountId, {
      page,
      limit,
    });

  const enriched = enrollments.map((enrollment) => {
    const progressPercentage = enrollment.TotalLessons
      ? Math.round(
          (enrollment.CompletedLessons / enrollment.TotalLessons) * 100
        )
      : 0;

    let completionDate = null;
    if (progressPercentage === 100 && enrollment.LastCompletedLessonAt) {
      completionDate = enrollment.LastCompletedLessonAt;
    }

    return {
      ...toCamelCaseObject(enrollment),
      progressPercentage,
      completionDate,
    };
  });

  return {
    enrollments: enriched,
    total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalPages: Math.ceil(total / limit),
  };
};

module.exports = {
  createEnrollment,
  isUserEnrolled,
  getMyEnrollments,
};
