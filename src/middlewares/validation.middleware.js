const Joi = require('joi');
const httpStatus = require('http-status').status;
const ApiError = require('../core/errors/ApiError');
const { pick } = require('../utils/pick');

/**
 * Middleware để validate request data dựa trên schema của Joi.
 * @param {object} schema - Schema Joi gồm các key: params, query, body.
 * @returns {function} - Middleware function.
 */
const validate = (schema) => (req, res, next) => {
  const validSchema = pick(schema, ['params', 'query', 'body']);
  const object = pick(req, Object.keys(validSchema));

  const { value, error } = Joi.compile(validSchema)
    .prefs({ errors: { label: 'key' }, abortEarly: false })
    .validate(object);

  if (error) {
    const errorMessage = error.details
      .map((details) => details.message)
      .join(', ');
    return next(new ApiError(httpStatus.BAD_REQUEST, errorMessage));
  }

  Object.assign(req, value);
  return next();
};

module.exports = validate;
