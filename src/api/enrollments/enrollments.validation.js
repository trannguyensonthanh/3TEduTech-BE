const Joi = require('joi');

/**
 * Validate createEnrollment params
 */
const createEnrollment = {
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
};

/**
 * Validate getMyEnrollments query
 */
const getMyEnrollments = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(50),
  }),
};

module.exports = {
  createEnrollment,
  getMyEnrollments,
};
