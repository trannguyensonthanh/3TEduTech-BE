const httpStatus = require('http-status').status;
const ApiError = require('../core/errors/ApiError');
const { verifyToken } = require('../utils/generateToken');
const authRepository = require('../api/auth/auth.repository');
const AccountStatus = require('../core/enums/AccountStatus');
const logger = require('../utils/logger');

/**
 * Middleware xác thực JWT token.
 * Lấy token từ header 'Authorization: Bearer <token>', xác thực và gắn thông tin user vào req.user.
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.header('Authorization');
  const token =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : null;
  if (!token) {
    return next(
      new ApiError(
        httpStatus.UNAUTHORIZED,
        'Yêu cầu xác thực. Vui lòng đăng nhập.'
      )
    );
  }

  try {
    const payload = await verifyToken(token);
    if (!payload || !payload.accountId) {
      return next(
        new ApiError(
          httpStatus.UNAUTHORIZED,
          'Token không hợp lệ hoặc đã hết hạn.'
        )
      );
    }

    const account = await authRepository.findAccountById(payload.accountId);
    if (!account || account.Status !== AccountStatus.ACTIVE) {
      return next(
        new ApiError(
          httpStatus.UNAUTHORIZED,
          'Người dùng không tồn tại hoặc không hoạt động.'
        )
      );
    }

    req.user = {
      id: account.AccountID,
      email: account.Email,
      role: account.RoleID,
    };

    return next();
  } catch (error) {
    logger.error('Authentication error:', error);
    return next(new ApiError(httpStatus.UNAUTHORIZED, 'Xác thực thất bại.'));
  }
};

/**
 * Middleware phân quyền dựa trên vai trò.
 * @param {string[]} requiredRoles - Mảng các RoleID được phép truy cập.
 * @returns {function} - Middleware function.
 */
const authorize = (requiredRoles) => (req, res, next) => {
  if (!req.user || !req.user.role) {
    return next(
      new ApiError(
        httpStatus.UNAUTHORIZED,
        'Yêu cầu xác thực trước khi phân quyền.'
      )
    );
  }

  if (Array.isArray(requiredRoles) && requiredRoles.includes(req.user.role)) {
    return next();
  }

  logger.warn(
    `Authorization failed: User ${req.user.id} (Role: ${
      req.user.role
    }) tried to access resource requiring roles: ${requiredRoles.join(', ')}`
  );
  return next(
    new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn không có quyền truy cập tài nguyên này.'
    )
  );
};

module.exports = {
  authenticate,
  authorize,
};
