const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const progressValidation = require('./progress.validation');
const progressController = require('./progress.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Áp dụng authenticate cho tất cả các route progress
router.use(authenticate);

// Route cập nhật tiến độ cho lesson cụ thể
router.post(
  '/lessons/:lessonId/complete',
  validate(progressValidation.markCompletion),
  progressController.markLessonCompletion
);

router.patch(
  '/lessons/:lessonId/position',
  validate(progressValidation.updatePosition),
  progressController.updateLastWatchedPosition
);

// Route lấy tiến độ tổng quan cho khóa học
router.get(
  '/courses/:courseId',
  validate(progressValidation.getCourseProgress),
  progressController.getCourseProgress
);

module.exports = router;
