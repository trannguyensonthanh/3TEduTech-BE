const httpStatus = require('http-status').status;
const sql = require('mssql');
const config = require('../config');
const logger = require('../utils/logger');
const ApiError = require('../core/errors/ApiError');

// Middleware chuyển đổi lỗi không phải ApiError thành ApiError
const errorConverter = (err, req, res, next) => {
  let error = err;
  if (!(error instanceof ApiError)) {
    let statusCode = error.statusCode || httpStatus.INTERNAL_SERVER_ERROR;
    let message = error.message || httpStatus[statusCode];

    if (error instanceof sql.RequestError) {
      if (error.number === 2627 || error.number === 2601) {
        statusCode = httpStatus.CONFLICT;
        message = `Duplicate entry detected. ${error.message}`;
      } else if (error.number === 547) {
        statusCode = httpStatus.BAD_REQUEST;
        message = `Foreign key constraint violation. ${error.message}`;
      } else {
        statusCode = httpStatus.INTERNAL_SERVER_ERROR;
        message = `Database request error: ${error.message}`;
      }
      logger.error(`SQL Request Error [${error.number}]: ${error.message}`);
    } else if (error instanceof sql.ConnectionError) {
      statusCode = httpStatus.SERVICE_UNAVAILABLE;
      message = `Database connection error: ${error.message}`;
      logger.error(`SQL Connection Error: ${error.message}`);
    } else if (error.isJoi === true) {
      statusCode = httpStatus.BAD_REQUEST;
      message = error.details.map((detail) => detail.message).join(', ');
    } else {
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

  if (config.env === 'production' && !err.isOperational) {
    statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    message = httpStatus[httpStatus.INTERNAL_SERVER_ERROR];
  }

  res.locals.errorMessage = err.message;

  const response = {
    code: statusCode,
    message,
    ...(config.env === 'development' && { stack: err.stack }),
  };

  if (config.env === 'development' || err.isOperational === false) {
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
