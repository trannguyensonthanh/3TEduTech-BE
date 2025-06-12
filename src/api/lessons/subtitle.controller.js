// src/api/lessons/subtitle.controller.js
const httpStatus = require('http-status').status;
const subtitleService = require('./subtitle.service');
const { catchAsync } = require('../../utils/catchAsync');

/**
 * Lấy danh sách phụ đề cho bài học
 */
const getSubtitles = catchAsync(async (req, res) => {
  const subtitles = await subtitleService.getSubtitles(
    req.params.lessonId,
    req.user
  );
  res.status(httpStatus.OK).send({ subtitles });
});

/**
 * Thêm phụ đề mới cho bài học
 */
const addSubtitle = catchAsync(async (req, res) => {
  const subtitle = await subtitleService.addSubtitle(
    req.params.lessonId,
    req.body,
    req.user
  );
  res.status(httpStatus.CREATED).send(subtitle);
});

/**
 * Đặt phụ đề chính cho bài học
 */
const setPrimarySubtitle = catchAsync(async (req, res) => {
  await subtitleService.setPrimarySubtitle(
    Number(req.params.lessonId),
    Number(req.params.subtitleId),
    req.user
  );
  const subtitles = await subtitleService.getSubtitles(
    req.params.lessonId,
    req.user
  );
  res
    .status(httpStatus.OK)
    .send({ message: 'Đặt phụ đề chính thành công.', subtitles });
});

/**
 * Xóa phụ đề khỏi bài học
 */
const deleteSubtitle = catchAsync(async (req, res) => {
  await subtitleService.deleteSubtitle(
    req.params.lessonId,
    req.params.subtitleId,
    req.user
  );
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  getSubtitles,
  addSubtitle,
  setPrimarySubtitle,
  deleteSubtitle,
};
