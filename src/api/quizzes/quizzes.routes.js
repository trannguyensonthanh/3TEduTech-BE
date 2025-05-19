const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const quizValidation = require('./quizzes.validation');
const quizController = require('./quizzes.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Các route này yêu cầu user đăng nhập
router.use(authenticate);

// Route để bắt đầu làm quiz cho một lesson
router.post(
  '/lessons/:lessonId/start',
  validate(quizValidation.startQuiz),
  quizController.startQuizAttempt
);

// Route để nộp bài làm
router.post(
  '/attempts/:attemptId/submit',
  validate(quizValidation.submitQuiz),
  quizController.submitQuizAttempt
);

// Route để xem kết quả chi tiết của một lượt làm
router.get(
  '/attempts/:attemptId/result',
  validate(quizValidation.getQuizResult),
  quizController.getQuizAttemptResult
);

// Route để xem lịch sử các lượt làm của một bài quiz
router.get(
  '/lessons/:lessonId/history',
  validate(quizValidation.getQuizHistory),
  quizController.getQuizAttemptHistory
);

module.exports = router;
