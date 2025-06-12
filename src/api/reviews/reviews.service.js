const httpStatus = require('http-status').status;
const { getConnection, sql } = require('../../database/connection');
const reviewRepository = require('./reviews.repository');
const courseRepository = require('../courses/courses.repository');
const enrollmentService = require('../enrollments/enrollments.service');
const ApiError = require('../../core/errors/ApiError');
const Roles = require('../../core/enums/Roles');
const logger = require('../../utils/logger');
const notificationService = require('../notifications/notifications.service');
const { toCamelCaseObject } = require('../../utils/caseConverter');
const userRepository = require('../users/users.repository');
/**
 * Hàm tiện ích để cập nhật rating trung bình và số lượng review cho khóa học.
 * @param {number} courseId
 */
async function updateCourseAverageRating(courseId) {
  const pool = await getConnection();
  const request = pool.request();
  request.input('CourseID', sql.BigInt, courseId);
  try {
    const result = await request.query(`
          SELECT
              COUNT(*) as reviewCount,
              AVG(CAST(Rating AS DECIMAL(3,1))) as averageRating
          FROM CourseReviews
          WHERE CourseID = @CourseID;
      `);
    const reviewCount = parseInt(result.recordset[0].reviewCount || 0, 10);
    let { averageRating } = result.recordset[0];
    averageRating =
      averageRating !== null ? parseFloat(averageRating.toFixed(1)) : null;

    const updateRequest = pool.request();
    updateRequest.input('CourseID', sql.BigInt, courseId);
    updateRequest.input('AverageRating', sql.Decimal(3, 1), averageRating);
    updateRequest.input('ReviewCount', sql.Int, reviewCount);
    updateRequest.input('UpdatedAt', sql.DateTime2, new Date());

    await updateRequest.query(`
          UPDATE Courses
          SET AverageRating = @AverageRating, ReviewCount = @ReviewCount, UpdatedAt = @UpdatedAt
          WHERE CourseID = @CourseID;
      `);
    logger.info(
      `Updated average rating for course ${courseId}: ${averageRating} (${reviewCount} reviews)`
    );
  } catch (error) {
    logger.error(
      `Error updating average rating for course ${courseId}:`,
      error
    );
  }
}

/**
 * Tạo hoặc cập nhật đánh giá cho khóa học.
 * @param {number} accountId
 * @param {number} courseId
 * @param {object} reviewBody - { rating, comment }
 * @returns {Promise<object>} - Review đã tạo/cập nhật (kèm thông tin user).
 */
const createOrUpdateReview = async (user, courseId, reviewBody) => {
  const accountId = user.id;
  const isAdmin = user.role === Roles.ADMIN || user.role === Roles.SUPERADMIN;
  const { rating, comment } = reviewBody;

  const course = await courseRepository.findCourseById(courseId, true);
  if (!course) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy khóa học.');
  }

  const isEnrolled = await enrollmentService.isUserEnrolled(
    accountId,
    courseId
  );
  if (!isEnrolled && !isAdmin) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn cần đăng ký khóa học này để có thể đánh giá.'
    );
  }

  const existingReview = await reviewRepository.findReviewByUserAndCourse(
    accountId,
    courseId
  );

  let savedReview;
  let isNewReview = false;

  if (existingReview) {
    logger.info(
      `Updating existing review ${existingReview.ReviewID} for course ${courseId} by user ${accountId}`
    );
    const updatedReviewData = await reviewRepository.updateReviewById(
      existingReview.ReviewID,
      { Rating: rating, Comment: comment }
    );
    savedReview = updatedReviewData || existingReview;
  } else {
    isNewReview = true;
    logger.info(
      `Creating new review for course ${courseId} by user ${accountId}`
    );
    const reviewData = {
      CourseID: courseId,
      AccountID: accountId,
      Rating: rating,
      Comment: comment,
    };
    const newReview = await reviewRepository.createReview(reviewData);
    savedReview = await reviewRepository.findReviewById(newReview.ReviewID);
    if (!savedReview) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Không thể lấy lại thông tin đánh giá vừa tạo.'
      );
    }
  }

  updateCourseAverageRating(courseId).catch((err) => {
    logger.error(
      `Background update rating failed for course ${courseId} after review change:`,
      err
    );
  });

  if (isNewReview && course.InstructorID !== accountId) {
    try {
      const message = `${savedReview.UserFullName || 'Ai đó'} vừa đánh giá ${savedReview.Rating} sao cho khóa học "${course.CourseName}" của bạn.`;
      await notificationService.createNotification(
        course.InstructorID,
        'NEW_COURSE_REVIEW',
        message,
        { type: 'Review', id: savedReview.ReviewID }
      );
    } catch (notifyError) {
      logger.error(
        `Failed to send new review notification for course ${courseId}:`,
        notifyError
      );
    }
  }

  return savedReview;
};

/**
 * Lấy danh sách đánh giá của một khóa học.
 * @param {number} courseId
 * @param {object} options - Phân trang, sắp xếp, filter rating.
 * @returns {Promise<object>} - { reviews, total, averageRating, page, limit, totalPages }
 */
const getReviewsByCourse = async (courseId, options) => {
  const { page = 1, limit = 10, sortBy, rating } = options;

  const result = await reviewRepository.findReviewsByCourseId(courseId, {
    page,
    limit,
    sortBy,
    rating,
  });

  return {
    reviews: toCamelCaseObject(result.reviews),
    total: result.total,
    averageRating:
      result.averageRating !== null
        ? parseFloat(result.averageRating.toFixed(1))
        : null,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalPages: Math.ceil(result.total / limit),
  };
};

/**
 * Lấy đánh giá của người dùng hiện tại cho một khóa học.
 * @param {number} accountId
 * @param {number} courseId
 * @returns {Promise<object|null>} - Đánh giá hoặc null nếu chưa đánh giá.
 */
const getMyReviewForCourse = async (accountId, courseId) => {
  const result = await reviewRepository.findReviewByUserAndCourse(
    accountId,
    courseId
  );
  return toCamelCaseObject(result);
};

/**
 * Xóa đánh giá (bởi người dùng tạo hoặc Admin).
 * @param {number} reviewId
 * @param {object} user - Người dùng thực hiện xóa.
 * @returns {Promise<void>}
 */
const deleteReview = async (reviewId, user) => {
  const review = await reviewRepository.findReviewById(reviewId);
  if (!review) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy đánh giá.');
  }

  const isAdmin = user.role === Roles.ADMIN || user.role === Roles.SUPERADMIN;
  const isOwner = review.AccountID === user.id;

  if (!isAdmin && !isOwner) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn không có quyền xóa đánh giá này.'
    );
  }

  const courseId = review.CourseID;

  await reviewRepository.deleteReviewById(reviewId);
  logger.info(`Review ${reviewId} deleted by user ${user.id}`);

  updateCourseAverageRating(courseId).catch((err) => {
    logger.error(
      `Background update rating failed for course ${courseId} after review delete:`,
      err
    );
  });
};

/**
 * Query for course reviews by instructor ID.
 * @param {number|string} instructorId
 * @param {object} filterOptions - Options for filtering reviews (e.g., minRating).
 * @param {object} paginationOptions - Options for pagination and sorting.
 * @returns {Promise<InstructorReviewListResponse>}
 */
const queryCourseReviewsByInstructor = async (
  instructorId,
  filterOptions,
  paginationOptions
) => {
  const instructor = await userRepository.findUserById(instructorId);
  if (!instructor || instructor.RoleID !== Roles.INSTRUCTOR) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Instructor not found');
  }

  const instructorCourses = await courseRepository.findAllCourses(
    { instructorId: parseInt(instructorId, 10), statusId: null },
    { limit: 0 }
  );

  const courseIds = instructorCourses.courses.map((course) => course.courseId);

  if (courseIds.length === 0) {
    return {
      reviews: [],
      total: 0,
      page: parseInt(paginationOptions.page, 10) || 1,
      limit: parseInt(paginationOptions.limit, 10) || 10,
      totalPages: 0,
    };
  }

  const combinedFilterOptions = {
    ...filterOptions,
    courseIds,
  };

  const result = await reviewRepository.findReviewsByFilters(
    combinedFilterOptions,
    paginationOptions
  );

  const mappedReviews = result.reviews.map((review) => ({
    reviewId: review.reviewId,
    courseId: review.courseId,
    courseName: review.courseName,
    rating: review.rating,
    comment: review.comment,
    accountId: review.accountId,
    userFullName: review.userFullName,
    userAvatarUrl: review.userAvatarUrl,
    reviewedAt: review.createdAt,
  }));

  return {
    reviews: mappedReviews,
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
  };
};

module.exports = {
  createOrUpdateReview,
  getReviewsByCourse,
  getMyReviewForCourse,
  deleteReview,
  queryCourseReviewsByInstructor,
};
