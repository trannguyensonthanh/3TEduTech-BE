/**
 * Tạo một object mới chỉ chứa các key được chỉ định từ object gốc.
 * @param {object} object - Object gốc.
 * @param {string[]} keys - Mảng các key muốn lấy.
 * @returns {object} - Object mới chỉ chứa các key đã chọn.
 */
const pick = (object, keys) => {
  return keys.reduce((obj, key) => {
    if (object && Object.prototype.hasOwnProperty.call(object, key)) {
      obj[key] = object[key];
    }
    return obj;
  }, {});
};

module.exports = { pick };
