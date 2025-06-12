const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');

const settingsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 phút

/**
 * Tìm setting bằng key (có cache).
 * @param {string} settingKey
 * @returns {Promise<object|null>}
 */
const findSettingByKey = async (settingKey) => {
  const cached = settingsCache.get(settingKey);
  if (cached && cached.value !== undefined && cached.expires > Date.now()) {
    return cached.value;
  }

  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('SettingKey', sql.VarChar, settingKey);
    const result = await request.query(
      'SELECT * FROM Settings WHERE SettingKey = @SettingKey'
    );
    const setting = result.recordset[0] || null;

    settingsCache.set(settingKey, {
      value: setting,
      expires: Date.now() + CACHE_TTL,
    });

    return setting;
  } catch (error) {
    logger.error(`Error finding setting by key ${settingKey}:`, error);
    if (cached && cached.value !== undefined) return cached.value;
    throw error;
  }
};

/**
 * Lấy tất cả các settings.
 * @returns {Promise<Array<object>>}
 */
const findAllSettings = async () => {
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

    settingsCache.delete(settingKey);
    logger.info(`Setting ${settingKey} updated, cache cleared.`);

    return result.recordset[0];
  } catch (error) {
    logger.error(`Error updating setting ${settingKey}:`, error);
    throw error;
  }
};

module.exports = {
  findSettingByKey,
  findAllSettings,
  updateSettingByKey,
};
