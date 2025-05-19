const httpStatus = require('http-status').status;
const ApiError = require('../core/errors/ApiError');
const { verifyToken } = require('../utils/generateToken');
const authRepository = require('../api/auth/auth.repository'); // Để kiểm tra user tồn tại/active
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
  console.log('Token:', token); // Log token để kiểm tra (có thể xóa sau)
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

    // Kiểm tra xem user có tồn tại và active không? (Tùy chọn nhưng nên có)
    const account = await authRepository.findAccountById(payload.accountId);
    if (!account || account.Status !== AccountStatus.ACTIVE) {
      return next(
        new ApiError(
          httpStatus.UNAUTHORIZED,
          'Người dùng không tồn tại hoặc không hoạt động.'
        )
      );
    }

    // Gắn thông tin user vào request để các controller/service sau có thể sử dụng
    req.user = {
      id: account.AccountID,
      email: account.Email, // Có thể không cần email ở đây
      role: account.RoleID,
      // Thêm các thông tin khác nếu cần thiết
    };

    logger.debug(
      `Authenticated user: ID=${req.user.id}, Role=${req.user.role}`
    );
    return next();
  } catch (error) {
    // Lỗi này không nên xảy ra nếu verifyToken xử lý tốt, nhưng để phòng ngừa
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
  console.log('Authorize middleware:', requiredRoles); // Log để kiểm tra
  console.log('User in request:', req.user); // Log thông tin user để kiểm tra
  // Đảm bảo middleware authenticate đã chạy trước và gắn req.user
  if (!req.user || !req.user.role) {
    return next(
      new ApiError(
        httpStatus.UNAUTHORIZED,
        'Yêu cầu xác thực trước khi phân quyền.'
      )
    );
  }

  // Nếu requiredRoles là một mảng và role của user nằm trong mảng đó
  if (Array.isArray(requiredRoles) && requiredRoles.includes(req.user.role)) {
    return next(); // Cho phép truy cập
  }

  // Nếu không được phép
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
