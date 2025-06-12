const httpStatus = require('http-status').status;
const { isNaN } = require('lodash');
const settingsRepository = require('./settings.repository');
const ApiError = require('../../core/errors/ApiError');

/**
 * Lấy tất cả settings (cho Admin).
 * @returns {Promise<Array<object>>}
 */
const getAllSettings = async () => {
  return settingsRepository.findAllSettings();
};

/**
 * Lấy giá trị của một setting cụ thể theo key.
 * Hàm này có thể dùng nội bộ trong các service khác.
 * @param {string} settingKey
 * @param {any} [defaultValue=null] - Giá trị trả về nếu không tìm thấy key.
 * @returns {Promise<string|any>} - Giá trị setting (dạng string) hoặc defaultValue.
 */
const getSettingValue = async (settingKey, defaultValue = null) => {
  const setting = await settingsRepository.findSettingByKey(settingKey);
  return setting ? setting.SettingValue : defaultValue;
};

/**
 * Cập nhật giá trị của một setting (cho Admin).
 * @param {string} settingKey
 * @param {string} settingValue
 * @returns {Promise<object>} - Setting đã cập nhật.
 */
const updateSetting = async (settingKey, settingValue) => {
  const setting = await settingsRepository.findSettingByKey(settingKey);
  if (!setting) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy cài đặt.');
  }
  if (!setting.IsEditableByAdmin) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn không có quyền sửa cài đặt này.'
    );
  }

  let validatedValue = settingValue;

  const booleanSettings = [
    'AllowUserRegistration',
    'AllowInstructorRegistration',
    'EnableVnPay',
    'EnableStripe',
    'EnablePayPal',
    'EnableMoMo',
    'EnableCrypto',
  ];
  if (booleanSettings.includes(settingKey)) {
    if (!['true', 'false'].includes(validatedValue.toLowerCase())) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Giá trị cho '${settingKey}' phải là 'true' hoặc 'false'.`
      );
    }
    validatedValue = validatedValue.toLowerCase();
  }

  const numericSettings = ['MinWithdrawalAmountVND', 'MinWithdrawalAmountUSD'];
  if (numericSettings.includes(settingKey)) {
    const amount = parseFloat(validatedValue);
    if (isNaN(amount) || amount < 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Giá trị cho '${settingKey}' phải là một số không âm.`
      );
    }
    validatedValue = amount.toString();
  }

  if (settingKey === 'SiteLogoUrl') {
    try {
      // eslint-disable-next-line no-new
      new URL(validatedValue);
    } catch (error) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Giá trị cho '${settingKey}' phải là một URL hợp lệ.`
      );
    }
  }

  if (settingKey === 'PlatformCommissionRate') {
    const rate = parseFloat(validatedValue);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Tỷ lệ hoa hồng không hợp lệ. Vui lòng nhập một số từ 0 đến 100.'
      );
    }
    validatedValue = rate.toFixed(2);
  }

  const updatedSetting = await settingsRepository.updateSettingByKey(
    settingKey,
    validatedValue
  );

  if (!updatedSetting) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Cập nhật cài đặt thất bại.'
    );
  }
  return updatedSetting;
};

module.exports = {
  getAllSettings,
  getSettingValue,
  updateSetting,
};
