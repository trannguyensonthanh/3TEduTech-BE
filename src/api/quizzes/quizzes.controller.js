const httpStatus = require('http-status').status;
const quizService = require('./quizzes.service');
const { catchAsync } = require('../../utils/catchAsync');
const { toCamelCaseObject } = require('../../utils/caseConverter');
const logger = require('../../utils/logger');

// === Instructor Controllers (sẽ được gọi từ lesson routes) ===
const createQuestion = catchAsync(async (req, res) => {
  const question = await quizService.createQuestionWithOptions(
    req.params.lessonId,
    req.body,
    req.user
  );
  res.status(httpStatus.CREATED).send(question);
});

const getQuestions = catchAsync(async (req, res) => {
  const questions = await quizService.getQuestionsForInstructor(
    req.params.lessonId,
    req.user
  );
  res.status(httpStatus.OK).send({ questions });
});

const updateQuestion = catchAsync(async (req, res) => {
  const question = await quizService.updateQuestionWithOptions(
    req.params.questionId,
    req.body,
    req.user
  );
  res.status(httpStatus.OK).send(question);
});

const deleteQuestion = catchAsync(async (req, res) => {
  await quizService.deleteQuestion(req.params.questionId, req.user);
  res.status(httpStatus.NO_CONTENT).send();
});

// === Student Controllers ===
const startQuizAttempt = catchAsync(async (req, res) => {
  const result = await quizService.startQuizAttempt(
    req.params.lessonId,
    req.user
  );
  res.status(httpStatus.CREATED).send(result);
});

const submitQuizAttempt = catchAsync(async (req, res) => {
  const result = await quizService.submitQuizAttempt(
    req.params.attemptId,
    req.body.answers,
    req.user
  );
  res.status(httpStatus.OK).send(toCamelCaseObject(result));
});

const getQuizAttemptResult = catchAsync(async (req, res) => {
  const result = await quizService.getQuizAttemptResult(
    req.params.attemptId,
    req.user
  );
  res.status(httpStatus.OK).send(result);
});

const getQuizAttemptHistory = catchAsync(async (req, res) => {
  const history = await quizService.getQuizAttemptHistory(
    req.params.lessonId,
    req.user
  );
  res.status(httpStatus.OK).send({ history });
});

module.exports = {
  // Instructor actions (called via lesson routes)
  createQuestion,
  getQuestions,
  updateQuestion,
  deleteQuestion,
  // Student actions
  startQuizAttempt,
  submitQuizAttempt,
  getQuizAttemptResult,
  getQuizAttemptHistory,
};
