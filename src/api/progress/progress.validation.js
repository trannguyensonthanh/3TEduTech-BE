const Joi = require('joi');

/**
 * Validation for marking lesson completion
 */
const markCompletion = {
  params: Joi.object().keys({
    lessonId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    isCompleted: Joi.boolean().required(),
  }),
};

/**
 * Validation for updating lesson position
 */
const updatePosition = {
  params: Joi.object().keys({
    lessonId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    position: Joi.number().integer().min(0).required(),
  }),
};

/**
 * Validation for getting course progress
 */
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
