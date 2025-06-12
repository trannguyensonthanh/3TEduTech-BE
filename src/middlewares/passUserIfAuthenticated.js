const { verifyToken } = require('../utils/generateToken');
const authRepository = require('../api/auth/auth.repository');
const AccountStatus = require('../core/enums/AccountStatus');
const logger = require('../utils/logger');

/**
 * Middleware cố gắng xác thực token và gắn req.user nếu thành công.
 * Nếu token không hợp lệ hoặc hết hạn, trả về lỗi 401.
 * Nếu không có token, tiếp tục xử lý request như bình thường.
 */
const passUserIfAuthenticated = async (req, res, next) => {
  const authHeader = req.header('Authorization');
  const token =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : null;

  if (token) {
    try {
      const payload = await verifyToken(token);

      if (payload && payload.accountId) {
        const account = await authRepository.findAccountById(payload.accountId);

        if (account && account.Status === AccountStatus.ACTIVE) {
          req.user = {
            id: account.AccountID,
            role: account.RoleID,
          };
          logger.debug(
            `User passed authentication: ID=${req.user.id}, Role=${req.user.role}`
          );
        }

        if (!account || account.Status !== AccountStatus.ACTIVE) {
          logger.debug(
            `Token valid but user ${payload.accountId} not found or inactive.`
          );
          return res.status(401).send({
            message: 'Người dùng không tồn tại hoặc không hoạt động.',
          });
        }
      }
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        logger.debug('Token expired.');
        return res.status(401).send({ message: 'Token đã hết hạn.' });
      }

      logger.debug('Invalid token.');
      return res.status(401).send({ message: 'Token không hợp lệ.' });
    }
  } else {
    logger.debug('No token provided for optional authentication.');
  }

  next();
};
module.exports = passUserIfAuthenticated;
