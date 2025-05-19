const httpStatus = require('http-status').status;
const progressService = require('./progress.service');
const { catchAsync } = require('../../utils/catchAsync');

const markLessonCompletion = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const { lessonId } = req.params;
  const { isCompleted } = req.body;
  const progress = await progressService.markLessonCompletion(
    accountId,
    lessonId,
    isCompleted
  );
  res.status(httpStatus.OK).send(progress);
});

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

const getCourseProgress = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const { courseId } = req.params;
  const progress = await progressService.getCourseProgress(accountId, courseId);
  res.status(httpStatus.OK).send(progress);
});

module.exports = {
  markLessonCompletion,
  updateLastWatchedPosition,
  getCourseProgress,
};
