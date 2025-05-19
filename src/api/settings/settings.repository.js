// src/api/settings/settings.repository.js
const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');

// Cache đơn giản để tránh query DB liên tục cho settings
const settingsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 phút

/**
 * Tìm setting bằng key (có cache).
 * @param {string} settingKey
 * @returns {Promise<object|null>}
 */
const findSettingByKey = async (settingKey) => {
  const cached = settingsCache.get(settingKey);
  // Kiểm tra cache hợp lệ
  if (cached && cached.value !== undefined && cached.expires > Date.now()) {
    // logger.debug(`Cache hit for setting: ${settingKey}`);
    return cached.value; // Trả về giá trị đã cache
  }

  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('SettingKey', sql.VarChar, settingKey);
    const result = await request.query(
      'SELECT * FROM Settings WHERE SettingKey = @SettingKey'
    );
    const setting = result.recordset[0] || null;

    // Update cache (lưu cả trường hợp không tìm thấy - null)
    settingsCache.set(settingKey, {
      value: setting,
      expires: Date.now() + CACHE_TTL,
    });
    // logger.debug(`Cache updated for setting: ${settingKey}`);

    return setting;
  } catch (error) {
    logger.error(`Error finding setting by key ${settingKey}:`, error);
    // Trả về giá trị cache cũ nếu lỗi DB? Hoặc throw lỗi?
    if (cached && cached.value !== undefined) return cached.value; // Trả về cache cũ nếu có lỗi DB
    throw error;
  }
};

/**
 * Lấy tất cả các settings.
 * @returns {Promise<Array<object>>}
 */
const findAllSettings = async () => {
  // Có thể cache kết quả này nếu ít thay đổi
  try {
    const pool = await getConnection();
    const result = await pool
      .request()
      .query('SELECT * FROM Settings ORDER BY SettingKey ASC;');
    return result.recordset;
  } catch (error) {
    logger.error('Error finding all settings:', error);
    throw error;
  }
};

/**
 * Cập nhật giá trị của một setting.
 * @param {string} settingKey
 * @param {string} settingValue
 * @returns {Promise<object>} - Setting đã cập nhật.
 */
const updateSettingByKey = async (settingKey, settingValue) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('SettingKey', sql.VarChar, settingKey);
    request.input('SettingValue', sql.NVarChar, settingValue);
    request.input('LastUpdated', sql.DateTime2, new Date());

    const result = await request.query(`
            UPDATE Settings
            SET SettingValue = @SettingValue, LastUpdated = @LastUpdated
            OUTPUT Inserted.*
            WHERE SettingKey = @SettingKey;
        `);

    // Xóa cache sau khi cập nhật
    settingsCache.delete(settingKey);
    logger.info(`Setting ${settingKey} updated, cache cleared.`);

    return result.recordset[0]; // Trả về bản ghi đã update
  } catch (error) {
    logger.error(`Error updating setting ${settingKey}:`, error);
    throw error;
  }
};

module.exports = {
  findSettingByKey,
  findAllSettings, // *** Thêm export ***
  updateSettingByKey, // *** Thêm export ***
};
