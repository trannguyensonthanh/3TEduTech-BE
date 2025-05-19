const slugifyLib = require('slugify');

/**
 * Tạo slug từ một chuỗi.
 * @param {string} text - Chuỗi cần tạo slug.
 * @returns {string} - Chuỗi slug đã được tạo.
 */
const generateSlug = (text) => {
  if (!text) return '';
  return slugifyLib(text, {
    replacement: '-', // Ký tự thay thế khoảng trắng
    remove: /[*+~.()'"!:@]/g, // Xóa các ký tự đặc biệt này
    lower: true, // Chuyển thành chữ thường
    strict: true, // Xóa các ký tự không hợp lệ hoàn toàn
    locale: 'vi', // Hỗ trợ tiếng Việt
    trim: true, // Xóa khoảng trắng đầu/cuối
  });
};

module.exports = { generateSlug };
