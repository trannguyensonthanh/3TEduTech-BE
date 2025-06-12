const slugifyLib = require('slugify');

/**
 * Tạo slug từ một chuỗi.
 * @param {string} text - Chuỗi cần tạo slug.
 * @returns {string} - Chuỗi slug đã được tạo.
 */
const generateSlug = (text) => {
  if (!text) return '';
  return slugifyLib(text, {
    replacement: '-',
    remove: /[*+~.()'"!:@]/g,
    lower: true,
    strict: true,
    locale: 'vi',
    trim: true,
  });
};

module.exports = { generateSlug };
