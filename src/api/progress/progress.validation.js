const Joi = require('joi');

const markCompletion = {
  params: Joi.object().keys({
    lessonId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    isCompleted: Joi.boolean().required(),
  }),
};

const updatePosition = {
  params: Joi.object().keys({
    lessonId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    position: Joi.number().integer().min(0).required(), // Vị trí tính bằng giây
  }),
};

const getCourseProgress = {
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
};

module.exports = {
  markCompletion,
  updatePosition,
  getCourseProgress,
};
