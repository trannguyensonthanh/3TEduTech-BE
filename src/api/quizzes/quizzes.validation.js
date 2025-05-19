const Joi = require('joi');

const optionSchema = Joi.object({
  optionId: Joi.number().integer().allow(null), // ID của option (có thể là ID từ DB hoặc ID tạm thời, không bắt buộc)
  optionText: Joi.string().required(),
  isCorrectAnswer: Joi.boolean().required(),
  optionOrder: Joi.number().integer().min(0).required(),
});

const createQuestion = {
  params: Joi.object().keys({
    lessonId: Joi.number().integer().required(), // Lấy từ route lồng nhau
  }),
  body: Joi.object().keys({
    questionText: Joi.string().required(),
    explanation: Joi.string().allow(null, ''),
    questionOrder: Joi.number().integer().min(0).required(), // Cần tính toán ở service
    options: Joi.array().items(optionSchema).min(2).required(),
  }),
};

const updateQuestion = {
  params: Joi.object().keys({
    questionId: Joi.number().integer().required(),
  }),
  body: Joi.object()
    .keys({
      questionText: Joi.string(),
      explanation: Joi.string().allow(null, ''),
      questionOrder: Joi.number().integer().min(0),
      options: Joi.array().items(optionSchema).min(2), // Cho phép cập nhật cả options
    })
    .min(1),
};

const deleteQuestion = {
  params: Joi.object().keys({
    questionId: Joi.number().integer().required(),
  }),
};

const startQuiz = {
  params: Joi.object().keys({
    lessonId: Joi.number().integer().required(),
  }),
};

const submitQuiz = {
  params: Joi.object().keys({
    attemptId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    answers: Joi.array()
      .items(
        Joi.object({
          questionId: Joi.number().integer().required(),
          selectedOptionId: Joi.number().integer().required().allow(null), // Allow null nếu user không chọn
        })
      )
      .required(),
  }),
};

const getQuizResult = {
  params: Joi.object().keys({
    attemptId: Joi.number().integer().required(),
  }),
};

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
