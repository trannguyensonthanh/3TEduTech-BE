const httpStatus = require('http-status').status;
const progressService = require('./progress.service');
const { catchAsync } = require('../../utils/catchAsync');

/**
 * Đánh dấu hoàn thành bài học
 */
const markLessonCompletion = catchAsync(async (req, res) => {
  const { user } = req;
  const { lessonId } = req.params;
  const { isCompleted } = req.body;
  const progress = await progressService.markLessonCompletion(
    user,
    lessonId,
    isCompleted
  );
  res.status(httpStatus.OK).send(progress);
});

/**
 * Cập nhật vị trí xem cuối cùng của bài học
 */
const updateLastWatchedPosition = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const { lessonId } = req.params;
  const { position } = req.body;
  const progress = await progressService.updateLastWatchedPosition(
    accountId,
    lessonId,
    position
  );
  res.status(httpStatus.OK).send(progress);
});

/**
 * Lấy tiến trình khóa học
 */
const getCourseProgress = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const progress = await progressService.getCourseProgress(req, courseId);
  res.status(httpStatus.OK).send(progress);
});

module.exports = {
  markLessonCompletion,
  updateLastWatchedPosition,
  getCourseProgress,
};
