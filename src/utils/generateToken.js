const httpStatus = require('http-status').status;
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment'); // Cài đặt: npm install moment
const jwtConfig = require('../config/jwt');
const logger = require('./logger');
const ApiError = require('../core/errors/ApiError');

/**
 * Tạo JWT access token.
 * @param {object} payload - Dữ liệu muốn đưa vào token (vd: { accountId: user.AccountID, role: user.RoleID }).
 * @returns {string} - Access token.
 */
const generateAccessToken = (payload) => {
  const expiresIn = `${jwtConfig.accessExpirationMinutes}m`;
  try {
    return jwt.sign(payload, jwtConfig.secret, { expiresIn });
  } catch (error) {
    logger.error('Error generating access token:', error);
    throw new Error('Could not generate access token');
  }
};

/**
 * Tạo JWT refresh token.
 * @param {object} payload - Dữ liệu muốn đưa vào token (thường chỉ cần accountId).
 * @returns {string} - Refresh token.
 */
const generateRefreshToken = (payload) => {
  const expiresIn = `${jwtConfig.refreshExpirationDays}d`;
  try {
    return jwt.sign(payload, jwtConfig.secret, { expiresIn });
  } catch (error) {
    logger.error('Error generating refresh token:', error);
    throw new Error('Could not generate refresh token');
  }
};

/**
 * Xác thực một JWT token.
 * @param {string} token - Token cần xác thực.
 * @returns {Promise<object|null>} - Payload của token nếu hợp lệ, null nếu không.
 */
const verifyToken = async (token) => {
  try {
    const payload = await jwt.verify(
      token,
      jwtConfig.secret,
      jwtConfig.verifyOptions
    );

    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Token đã hết hạn.');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Token không hợp lệ.');
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Lỗi xác thực token.');
  }
};

/**
 * Tạo một token ngẫu nhiên (sử dụng UUID v4) cho việc xác thực email hoặc reset password.
 * @returns {string} - Chuỗi token ngẫu nhiên.
 */
const generateRandomToken = () => {
  return uuidv4();
};

/**
 * Tính toán thời gian hết hạn cho token (email verification, password reset).
 * @param {number} minutesToExpire - Số phút token có hiệu lực.
 * @returns {Date} - Đối tượng Date biểu thị thời gian hết hạn.
 */
const calculateTokenExpiration = (minutesToExpire) => {
  return moment().add(minutesToExpire, 'minutes').toDate();
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  generateRandomToken,
  calculateTokenExpiration,
};
