const httpStatus = require('http-status').status;
const { getConnection, sql } = require('../../database/connection'); // Cần cho transaction
const reviewRepository = require('./reviews.repository');
const courseRepository = require('../courses/courses.repository'); // Check course
const enrollmentService = require('../enrollments/enrollments.service'); // Check enrollment
const ApiError = require('../../core/errors/ApiError');
const Roles = require('../../core/enums/Roles');
const logger = require('../../utils/logger');
const notificationService = require('../notifications/notifications.service');
const { toCamelCaseObject } = require('../../utils/caseConverter');

/**
 * Hàm tiện ích để cập nhật rating trung bình và số lượng review cho khóa học.
 * @param {number} courseId
 */
async function updateCourseAverageRating(courseId) {
  const pool = await getConnection(); // Import getConnection từ database/connection
  const request = pool.request();
  request.input('CourseID', sql.BigInt, courseId);
  try {
    // Tính lại rating trung bình và số lượng review từ bảng CourseReviews
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

    // Cập nhật vào bảng Courses
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
    // Không nên throw lỗi ở đây vì đây là tác vụ nền
  }
}

/**
 * Tạo hoặc cập nhật đánh giá cho khóa học.
 * @param {number} accountId
 * @param {number} courseId
 * @param {object} reviewBody - { rating, comment }
 * @returns {Promise<object>} - Review đã tạo/cập nhật (kèm thông tin user).
 */
const createOrUpdateReview = async (accountId, courseId, reviewBody) => {
  const { rating, comment } = reviewBody;
  console.log('reviewBody', reviewBody);
  // 1. Kiểm tra khóa học tồn tại (lấy cả thông tin instructor để gửi thông báo)
  const course = await courseRepository.findCourseById(courseId, true); // Lấy cả draft/archived để check enroll
  if (!course) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy khóa học.');
  }

  // 2. Kiểm tra đã đăng ký khóa học chưa
  const isEnrolled = await enrollmentService.isUserEnrolled(
    accountId,
    courseId
  );
  if (!isEnrolled) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn cần đăng ký khóa học này để có thể đánh giá.'
    );
  }

  // 3. Kiểm tra xem user đã đánh giá khóa này chưa
  const existingReview = await reviewRepository.findReviewByUserAndCourse(
    accountId,
    courseId
  );

  let savedReview; // Biến lưu kết quả cuối cùng (bản ghi review đầy đủ)
  let isNewReview = false; // Cờ để biết là tạo mới hay cập nhật

  if (existingReview) {
    // --- CẬP NHẬT ĐÁNH GIÁ ---
    logger.info(
      `Updating existing review ${existingReview.ReviewID} for course ${courseId} by user ${accountId}`
    );
    const updatedReviewData = await reviewRepository.updateReviewById(
      existingReview.ReviewID,
      { Rating: rating, Comment: comment }
    );
    // updateReviewById trả về bản ghi đầy đủ (kèm user info) nếu thành công, null nếu không đổi
    savedReview = updatedReviewData || existingReview; // Lấy kết quả update hoặc giữ cái cũ nếu ko đổi
  } else {
    // --- TẠO MỚI ĐÁNH GIÁ ---
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
    // Lấy lại bản ghi đầy đủ kèm thông tin user
    savedReview = await reviewRepository.findReviewById(newReview.ReviewID);
    if (!savedReview) {
      // Lỗi không mong muốn
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Không thể lấy lại thông tin đánh giá vừa tạo.'
      );
    }
  }

  // 4. Cập nhật rating trung bình cho khóa học (chạy ngầm)
  updateCourseAverageRating(courseId).catch((err) => {
    logger.error(
      `Background update rating failed for course ${courseId} after review change:`,
      err
    );
  });

  // 5. Gửi thông báo cho instructor nếu là review mới và người đánh giá không phải instructor
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

  // 6. Trả về bản ghi review đã lưu (đã có thông tin user)
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

  // Kiểm tra khóa học tồn tại (optional, repo cũng sẽ không tìm thấy gì)
  // const course = await courseRepository.findCourseById(courseId);
  // if (!course) throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy khóa học.');

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
        : null, // Làm tròn 1 chữ số
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
  return toCamelCaseObject(result); // Chuyển đổi sang camelCase
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

  const courseId = review.CourseID; // Lấy courseId trước khi xóa

  await reviewRepository.deleteReviewById(reviewId);
  logger.info(`Review ${reviewId} deleted by user ${user.id}`);

  // Gọi hàm cập nhật rating sau khi xóa thành công
  updateCourseAverageRating(courseId).catch((err) => {
    logger.error(
      `Background update rating failed for course ${courseId} after review delete:`,
      err
    );
  }); // Chạy ngầm
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
  // currentUser = null // Nếu cần kiểm tra quyền
) => {
  // 1. Kiểm tra instructor tồn tại và có vai trò là INSTRUCTOR
  const instructor = await userRepository.findUserById(instructorId);
  if (!instructor || instructor.RoleID !== Roles.INSTRUCTOR) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Instructor not found');
  }

  // 2. Lấy danh sách CourseIDs mà instructor này dạy
  // Giả sử hàm findAllCourses của courseRepository có thể trả về chỉ CourseID khi cần
  // Hoặc tạo một hàm mới trong courseRepository: findCourseIdsByInstructorId
  const instructorCourses = await courseRepository.findAllCourses(
    { instructorId: parseInt(instructorId, 10), statusId: null }, // Lấy tất cả khóa học của GV, bất kể trạng thái
    { limit: 0 } // Lấy tất cả, không phân trang
  );

  const courseIds = instructorCourses.courses.map((course) => course.courseId);

  if (courseIds.length === 0) {
    // Nếu giảng viên không có khóa học nào, trả về danh sách rỗng
    return {
      reviews: [],
      total: 0,
      page: parseInt(paginationOptions.page, 10) || 1,
      limit: parseInt(paginationOptions.limit, 10) || 10,
      totalPages: 0,
    };
  }

  // 3. Gọi repository để lấy reviews dựa trên danh sách courseIds
  const combinedFilterOptions = {
    ...filterOptions,
    courseIds, // Truyền mảng courseIds vào filter
  };

  const result = await reviewRepository.findReviewsByFilters(
    // Cần tạo/điều chỉnh hàm này
    combinedFilterOptions,
    paginationOptions
  );

  // Map kết quả từ repository sang cấu trúc InstructorReviewItem
  const mappedReviews = result.reviews.map((review) => ({
    reviewId: review.reviewId, // Đảm bảo repository trả về các trường này
    courseId: review.courseId,
    courseName: review.courseName, // Cần JOIN với Courses trong repository
    rating: review.rating,
    comment: review.comment,
    accountId: review.accountId, // ID người review
    userFullName: review.userFullName, // Cần JOIN với UserProfiles trong repository
    userAvatarUrl: review.userAvatarUrl, // Cần JOIN với UserProfiles
    reviewedAt: review.createdAt, // Hoặc UpdatedAt tùy theo logic
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
  // updateCourseAverageRating, // Có thể gọi hàm này trong các hàm trên
  queryCourseReviewsByInstructor,
};
