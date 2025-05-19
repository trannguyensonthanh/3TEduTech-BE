const bcrypt = require('bcryptjs');

/**
 * Hash một mật khẩu.
 * @param {string} password - Mật khẩu cần hash.
 * @returns {Promise<string>} - Mật khẩu đã được hash.
 */
const hashPassword = async (password) => {
  // Số vòng salt, 8-12 thường là đủ cân bằng giữa bảo mật và hiệu năng
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
};

/**
 * So sánh mật khẩu thuần với mật khẩu đã hash.
 * @param {string} plainPassword - Mật khẩu người dùng nhập vào.
 * @param {string} hashedPassword - Mật khẩu đã hash lưu trong DB.
 * @returns {Promise<boolean>} - True nếu khớp, false nếu không.
 */
const comparePassword = async (plainPassword, hashedPassword) => {
  return bcrypt.compare(plainPassword, hashedPassword);
};

module.exports = {
  hashPassword,
  comparePassword,
};
