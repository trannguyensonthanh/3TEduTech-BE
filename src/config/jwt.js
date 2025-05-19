const config = require('./index'); // Import config tổng

module.exports = {
  secret: config.jwt.secret,
  accessExpirationMinutes: config.jwt.accessExpirationMinutes,
  refreshExpirationDays: config.jwt.refreshExpirationDays,
  // Thêm các tùy chọn khác nếu cần (ví dụ: algorithm, issuer)
  verifyOptions: {
    // algorithms: ['HS256'] // Mặc định thường là HS256
  },
  // Có thể thêm các loại token khác nếu cần
  emailVerificationTokenExpiresMinutes: 60 * 24, // Ví dụ: token xác thực email hết hạn sau 1 ngày
  passwordResetTokenExpiresMinutes: 60, // Ví dụ: token reset password hết hạn sau 1 giờ
};
