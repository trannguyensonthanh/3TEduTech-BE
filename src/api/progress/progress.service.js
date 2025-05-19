const httpStatus = require('http-status').status;
const progressRepository = require('./progress.repository');
const lessonRepository = require('../lessons/lessons.repository'); // Để kiểm tra lesson
const enrollmentService = require('../enrollments/enrollments.service'); // Để kiểm tra enrollment
const ApiError = require('../../core/errors/ApiError');
const logger = require('../../utils/logger');

/**
 * Đánh dấu bài học là hoàn thành/chưa hoàn thành.
 * @param {number} accountId
 * @param {number} lessonId
 * @param {boolean} isCompleted
 * @returns {Promise<object>} - Bản ghi progress đã cập nhật.
 */
const markLessonCompletion = async (accountId, lessonId, isCompleted) => {
  // 1. Kiểm tra lesson tồn tại
  const lesson = await lessonRepository.findLessonById(lessonId);
  if (!lesson) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Bài học không tồn tại.');
  }

  // 2. Kiểm tra người dùng đã đăng ký khóa học chưa
  const enrolled = await enrollmentService.isUserEnrolled(
    accountId,
    lesson.CourseID
  );
  if (!enrolled) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn cần đăng ký khóa học để cập nhật tiến độ.'
    );
  }

  // 3. Tìm hoặc tạo bản ghi progress
  const progress = await progressRepository.findOrCreateProgress(
    accountId,
    lessonId
  );

  // 4. Cập nhật trạng thái hoàn thành
  const updateData = { IsCompleted: isCompleted };
  const updatedProgress = await progressRepository.updateProgressById(
    progress.ProgressID,
    updateData
  );

  if (!updatedProgress) {
    // Nếu repo trả về null (chỉ cập nhật LastWatchedAt), lấy lại bản ghi gốc
    const currentProgress = await progressRepository.findOrCreateProgress(
      accountId,
      lessonId
    );
    logger.info(
      `Lesson ${lessonId} completion status for user ${accountId} set to ${isCompleted} (no change or only LastWatchedAt updated).`
    );
    return currentProgress;
  }

  logger.info(
    `Lesson ${lessonId} completion status for user ${accountId} updated to ${isCompleted}.`
  );
  return updatedProgress;
};

/**
 * Cập nhật vị trí xem cuối cùng của video.
 * @param {number} accountId
 * @param {number} lessonId
 * @param {number} positionSeconds - Vị trí (giây).
 * @returns {Promise<object>} - Bản ghi progress đã cập nhật.
 */
const updateLastWatchedPosition = async (
  accountId,
  lessonId,
  positionSeconds
) => {
  // 1. Kiểm tra lesson tồn tại
  const lesson = await lessonRepository.findLessonById(lessonId);
  if (!lesson) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Bài học không tồn tại.');
  }
  // Có thể kiểm tra lesson type là video ở đây

  // 2. Kiểm tra enrollment
  const enrolled = await enrollmentService.isUserEnrolled(
    accountId,
    lesson.CourseID
  );
  if (!enrolled) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn cần đăng ký khóa học để cập nhật tiến độ.'
    );
  }

  // 3. Tìm hoặc tạo progress
  const progress = await progressRepository.findOrCreateProgress(
    accountId,
    lessonId
  );

  // 4. Cập nhật vị trí
  const updateData = { LastWatchedPosition: positionSeconds };
  const updatedProgress = await progressRepository.updateProgressById(
    progress.ProgressID,
    updateData
  );

  if (!updatedProgress) {
    const currentProgress = await progressRepository.findOrCreateProgress(
      accountId,
      lessonId
    );
    logger.info(
      `Last watched position for lesson ${lessonId}, user ${accountId} set to ${positionSeconds} (only LastWatchedAt updated?).`
    );
    return currentProgress;
  }
  logger.info(
    `Last watched position for lesson ${lessonId}, user ${accountId} updated to ${positionSeconds}.`
  );
  return updatedProgress;
};

/**
 * Lấy tiến độ tổng quan của người dùng cho một khóa học.
 * @param {number} accountId
 * @param {number} courseId
 * @returns {Promise<{totalLessons: number, completedLessons: number, percentage: number, progressDetails: object[]}>}
 */
const getCourseProgress = async (accountId, courseId) => {
  // Kiểm tra enrollment
  const enrolled = await enrollmentService.isUserEnrolled(accountId, courseId);
  if (!enrolled) {
    // Hoặc trả về progress = 0 thay vì lỗi? Tùy logic hiển thị
    throw new ApiError(httpStatus.FORBIDDEN, 'Bạn chưa đăng ký khóa học này.');
  }

  const totalLessons =
    await progressRepository.countTotalLessonsInCourse(courseId);
  if (totalLessons === 0) {
    return {
      totalLessons: 0,
      completedLessons: 0,
      percentage: 0,
      progressDetails: [],
    };
  }

  const completedLessons =
    await progressRepository.countCompletedLessonsInCourse(accountId, courseId);
  const percentage = Math.round((completedLessons / totalLessons) * 100);

  // Lấy chi tiết từng bài học (tùy chọn, có thể nặng nếu nhiều bài)
  const progressDetails = await progressRepository.findAllProgressInCourse(
    accountId,
    courseId
  );

  return {
    totalLessons,
    completedLessons,
    percentage,
    progressDetails, // Mảng các bản ghi LessonProgress
  };
};

module.exports = {
  markLessonCompletion,
  updateLastWatchedPosition,
  getCourseProgress,
};
