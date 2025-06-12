const Joi = require('joi');

// Validate option schema
const optionSchema = Joi.object({
  optionId: Joi.number().integer().allow(null),
  optionText: Joi.string().required(),
  isCorrectAnswer: Joi.boolean().required(),
  optionOrder: Joi.number().integer().min(0).required(),
});

// Validate create question
const createQuestion = {
  params: Joi.object().keys({
    lessonId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    questionText: Joi.string().required(),
    explanation: Joi.string().allow(null, ''),
    questionOrder: Joi.number().integer().min(0).required(),
    options: Joi.array().items(optionSchema).min(2).required(),
  }),
};

// Validate update question
const updateQuestion = {
  params: Joi.object().keys({
    questionId: Joi.number().integer().required(),
  }),
  body: Joi.object()
    .keys({
      questionText: Joi.string(),
      explanation: Joi.string().allow(null, ''),
      questionOrder: Joi.number().integer().min(0),
      options: Joi.array().items(optionSchema).min(2),
    })
    .min(1),
};

// Validate delete question
const deleteQuestion = {
  params: Joi.object().keys({
    questionId: Joi.number().integer().required(),
  }),
};

// Validate start quiz
const startQuiz = {
  params: Joi.object().keys({
    lessonId: Joi.number().integer().required(),
  }),
};

// Validate submit quiz
const submitQuiz = {
  params: Joi.object().keys({
    attemptId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    answers: Joi.array()
      .items(
        Joi.object({
          questionId: Joi.number().integer().required(),
          selectedOptionId: Joi.number().integer().required().allow(null),
        })
      )
      .required(),
  }),
};

// Validate get quiz result
const getQuizResult = {
  params: Joi.object().keys({
    attemptId: Joi.number().integer().required(),
  }),
};

// Validate get quiz history
const getQuizHistory = {
  params: Joi.object().keys({
    lessonId: Joi.number().integer().required(),
  }),
};

module.exports = {
  // Instructor
  createQuestion,
  updateQuestion,
  deleteQuestion,
  // Student
  startQuiz,
  submitQuiz,
  getQuizResult,
  getQuizHistory,
};
