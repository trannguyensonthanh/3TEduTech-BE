const Joi = require('joi');
const httpStatus = require('http-status').status;
const ApiError = require('../core/errors/ApiError');
const { pick } = require('../utils/pick'); // Tạo hàm pick nếu chưa có

/**
 * Middleware để validate request data dựa trên schema của Joi.
 * @param {object} schema - Schema Joi gồm các key: params, query, body.
 * @returns {function} - Middleware function.
 */
const validate = (schema) => (req, res, next) => {
  // Chọn các phần của request cần validate dựa trên schema
  const validSchema = pick(schema, ['params', 'query', 'body']);
  // Chọn dữ liệu tương ứng từ request
  const object = pick(req, Object.keys(validSchema));

  // Thực hiện validation
  const { value, error } = Joi.compile(validSchema)
    .prefs({ errors: { label: 'key' }, abortEarly: false }) // abortEarly: false để hiển thị tất cả lỗi
    .validate(object);

  // Nếu có lỗi validation
  if (error) {
    // Format lỗi thành một chuỗi dễ đọc
    const errorMessage = error.details
      .map((details) => details.message)
      .join(', ');
    // Tạo ApiError với status BAD_REQUEST
    return next(new ApiError(httpStatus.BAD_REQUEST, errorMessage));
  }

  // Nếu validation thành công, gán giá trị đã được chuẩn hóa (nếu có) vào req
  Object.assign(req, value);
  return next();
};

module.exports = validate;
