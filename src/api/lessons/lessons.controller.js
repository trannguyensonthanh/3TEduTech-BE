const httpStatus = require('http-status').status;
const lessonService = require('./lessons.service');
const { catchAsync } = require('../../utils/catchAsync');
const ApiError = require('../../core/errors/ApiError');

const createLesson = catchAsync(async (req, res) => {
  // Tạo bài học mới
  const lesson = await lessonService.createLesson(
    req.params.sectionId,
    req.body,
    req.user
  );
  res.status(httpStatus.CREATED).send(lesson);
});

const getLessons = catchAsync(async (req, res) => {
  // Lấy danh sách bài học theo section
  const lessons = await lessonService.getLessonsBySection(
    req.params.sectionId,
    req.user
  );
  res.status(httpStatus.OK).send({ lessons });
});

const getLesson = catchAsync(async (req, res) => {
  // Lấy chi tiết một bài học
  const lesson = await lessonService.getLesson(req.params.lessonId, req.user);
  res.status(httpStatus.OK).send(lesson);
});

const updateLesson = catchAsync(async (req, res) => {
  // Cập nhật bài học
  const lesson = await lessonService.updateLesson(
    req.params.lessonId,
    req.body,
    req.user
  );
  res.status(httpStatus.OK).send(lesson);
});

const deleteLesson = catchAsync(async (req, res) => {
  // Xóa bài học
  await lessonService.deleteLesson(req.params.lessonId, req.user);
  res.status(httpStatus.NO_CONTENT).send();
});

const updateLessonsOrder = catchAsync(async (req, res) => {
  // Cập nhật thứ tự các bài học trong section
  await lessonService.updateLessonsOrder(
    req.params.sectionId,
    req.body,
    req.user
  );
  const updatedLessons = await lessonService.getLessonsBySection(
    req.params.sectionId,
    req.user
  );
  res.status(httpStatus.OK).send({ lessons: updatedLessons });
});

const updateLessonVideo = catchAsync(async (req, res) => {
  // Cập nhật video cho bài học
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Vui lòng cung cấp file video.');
  }
  const lesson = await lessonService.updateLessonVideo(
    req.params.lessonId,
    req.file,
    req.user
  );
  res.status(httpStatus.OK).send(lesson);
});

const addLessonAttachment = catchAsync(async (req, res) => {
  // Thêm file đính kèm cho bài học
  if (!req.file) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Vui lòng cung cấp file đính kèm.'
    );
  }
  const attachment = await lessonService.addLessonAttachment(
    req.params.lessonId,
    req.file,
    req.user
  );
  res.status(httpStatus.CREATED).send(attachment);
});

const deleteLessonAttachment = catchAsync(async (req, res) => {
  // Xóa file đính kèm của bài học
  await lessonService.deleteLessonAttachment(
    req.params.lessonId,
    req.params.attachmentId,
    req.user
  );
  res.status(httpStatus.NO_CONTENT).send();
});

const getLessonVideoUrl = catchAsync(async (req, res) => {
  // Lấy URL video của bài học
  const urlData = await lessonService.getLessonVideoUrl(
    req.user.id,
    req.params.lessonId
  );
  res.status(httpStatus.OK).send(urlData);
});

module.exports = {
  createLesson,
  getLessons,
  getLesson,
  updateLesson,
  deleteLesson,
  updateLessonsOrder,
  updateLessonVideo,
  addLessonAttachment,
  deleteLessonAttachment,
  getLessonVideoUrl,
};
