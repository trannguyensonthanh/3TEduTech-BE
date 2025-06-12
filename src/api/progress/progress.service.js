const httpStatus = require('http-status').status;
const progressRepository = require('./progress.repository');
const lessonRepository = require('../lessons/lessons.repository');
const enrollmentService = require('../enrollments/enrollments.service');
const ApiError = require('../../core/errors/ApiError');
const logger = require('../../utils/logger');
const Roles = require('../../core/enums/Roles');

/**
 * Đánh dấu bài học là hoàn thành/chưa hoàn thành.
 * @param {number} accountId
 * @param {number} lessonId
 * @param {boolean} isCompleted
 * @returns {Promise<object>} - Bản ghi progress đã cập nhật.
 */
const markLessonCompletion = async (user, lessonId, isCompleted) => {
  const accountId = user.id;
  const isAdmin = user.role === Roles.ADMIN || user.role === Roles.SUPERADMIN;
  const lesson = await lessonRepository.findLessonById(lessonId);
  if (!lesson) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Bài học không tồn tại.');
  }
  const enrolled = await enrollmentService.isUserEnrolled(
    accountId,
    lesson.CourseID
  );
  if (!enrolled && !isAdmin) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn cần đăng ký khóa học để cập nhật tiến độ.'
    );
  }
  const progress = await progressRepository.findOrCreateProgress(
    accountId,
    lessonId
  );
  const updateData = { IsCompleted: isCompleted };
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
  const lesson = await lessonRepository.findLessonById(lessonId);
  if (!lesson) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Bài học không tồn tại.');
  }
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
  const progress = await progressRepository.findOrCreateProgress(
    accountId,
    lessonId
  );
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
const getCourseProgress = async (user, courseId) => {
  const accountId = user.id;
  const isAdmin = user.role === Roles.ADMIN || user.role === Roles.SUPERADMIN;
  logger.info(
    `Getting course progress for user ${accountId}, course ${courseId}.`
  );
  const enrolled = await enrollmentService.isUserEnrolled(accountId, courseId);
  if (!enrolled && !isAdmin) {
    logger.error(
      `User ${accountId} attempted to access progress for course ${courseId} without enrollment.`
    );
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
  const progressDetails = await progressRepository.findAllProgressInCourse(
    accountId,
    courseId
  );
  return {
    totalLessons,
    completedLessons,
    percentage,
    progressDetails,
  };
};

module.exports = {
  markLessonCompletion,
  updateLastWatchedPosition,
  getCourseProgress,
};
