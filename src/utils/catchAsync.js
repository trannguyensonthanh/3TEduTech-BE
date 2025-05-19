/**
 * Wrapper cho các hàm async controller để bắt lỗi và chuyển đến middleware xử lý lỗi.
 * @param {function} fn - Hàm controller async (req, res, next).
 * @returns {function} - Hàm controller đã được wrap.
 */
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => next(err));
};

module.exports = { catchAsync };
