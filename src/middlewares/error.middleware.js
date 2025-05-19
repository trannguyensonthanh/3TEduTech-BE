const httpStatus = require('http-status').status;
const sql = require('mssql'); // Import mssql để kiểm tra lỗi DB cụ thể
const config = require('../config');
const logger = require('../utils/logger');
const ApiError = require('../core/errors/ApiError');

// Middleware chuyển đổi lỗi không phải ApiError thành ApiError
const errorConverter = (err, req, res, next) => {
  let error = err;
  if (!(error instanceof ApiError)) {
    let statusCode = error.statusCode || httpStatus.INTERNAL_SERVER_ERROR;
    let message = error.message || httpStatus[statusCode];

    // Xử lý lỗi cụ thể từ SQL Server nếu cần
    if (error instanceof sql.RequestError) {
      // Lỗi UNIQUE constraint thường có number 2627 hoặc 2601
      if (error.number === 2627 || error.number === 2601) {
        statusCode = httpStatus.CONFLICT; // Hoặc BAD_REQUEST
        message = `Duplicate entry detected. ${error.message}`; // Cung cấp thông tin rõ hơn nếu có thể
      } else if (error.number === 547) {
        // Lỗi Foreign Key constraint
        statusCode = httpStatus.BAD_REQUEST;
        message = `Foreign key constraint violation. ${error.message}`;
      } else {
        // Các lỗi SQL khác có thể là Internal Server Error
        statusCode = httpStatus.INTERNAL_SERVER_ERROR;
        message = `Database request error: ${error.message}`;
      }
      logger.error(`SQL Request Error [${error.number}]: ${error.message}`);
    } else if (error instanceof sql.ConnectionError) {
      statusCode = httpStatus.SERVICE_UNAVAILABLE;
      message = `Database connection error: ${error.message}`;
      logger.error(`SQL Connection Error: ${error.message}`);
    }
    // Nếu là lỗi validation của Joi
    else if (error.isJoi === true) {
      statusCode = httpStatus.BAD_REQUEST;
      message = error.details.map((detail) => detail.message).join(', ');
    }
    // Các lỗi khác
    else {
      // Giữ nguyên statusCode nếu có, nếu không thì là 500
      statusCode = error.statusCode || httpStatus.INTERNAL_SERVER_ERROR;
      message = error.message || httpStatus[statusCode];
    }

    error = new ApiError(statusCode, message, false, err.stack);
  }
  next(error);
};

// Middleware xử lý lỗi cuối cùng, gửi response về client
const errorHandler = (err, req, res, next) => {
  let { statusCode, message } = err;

  // Nếu là lỗi không dự kiến trong production, ẩn thông điệp lỗi chi tiết
  if (config.env === 'production' && !err.isOperational) {
    statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    message = httpStatus[httpStatus.INTERNAL_SERVER_ERROR];
  }

  res.locals.errorMessage = err.message; // Lưu message lỗi vào res.locals để có thể dùng ở đâu đó khác nếu cần

  const response = {
    code: statusCode,
    message,
    // Chỉ trả về stack trace khi ở môi trường dev
    ...(config.env === 'development' && { stack: err.stack }),
  };

  // Ghi log lỗi
  if (config.env === 'development' || err.isOperational === false) {
    // Chỉ log stack trace cho lỗi nghiêm trọng hoặc khi dev
    logger.error(
      `[${statusCode}] ${message} - ${req.originalUrl} - ${req.method} - ${
        req.ip
      }\n${err.stack || ''}`
    );
  } else {
    logger.warn(
      `[${statusCode}] ${message} - ${req.originalUrl} - ${req.method} - ${req.ip}`
    );
  }

  res.status(statusCode).send(response);
};

module.exports = {
  errorConverter,
  errorHandler,
};
