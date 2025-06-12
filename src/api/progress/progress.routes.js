const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const progressValidation = require('./progress.validation');
const progressController = require('./progress.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(authenticate);

/**
 * Cập nhật tiến độ cho lesson cụ thể
 */
router.post(
  '/lessons/:lessonId/complete',
  validate(progressValidation.markCompletion),
  progressController.markLessonCompletion
);

/**
 * Cập nhật vị trí cuối cùng đã xem của lesson
 */
router.patch(
  '/lessons/:lessonId/position',
  validate(progressValidation.updatePosition),
  progressController.updateLastWatchedPosition
);

/**
 * Lấy tiến độ tổng quan cho khóa học
 */
router.get(
  '/courses/:courseId',
  validate(progressValidation.getCourseProgress),
  progressController.getCourseProgress
);

module.exports = router;
