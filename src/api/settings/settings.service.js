const httpStatus = require('http-status').status;
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
  // 1. Tìm setting để kiểm tra tồn tại và quyền sửa
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

  // 2. TODO: Validate kiểu dữ liệu của settingValue dựa trên settingKey nếu cần
  // Ví dụ: Nếu key là 'PlatformCommissionRate', value phải là số hợp lệ (0-100)
  let validatedValue = settingValue; // Create a new variable to hold the validated value

  if (settingKey === 'PlatformCommissionRate') {
    const rate = parseFloat(validatedValue);
    if (Number.isNaN(rate) || rate < 0 || rate > 100) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Tỷ lệ hoa hồng không hợp lệ (phải từ 0 đến 100).'
      );
    }
    // Lưu dạng string chuẩn (ví dụ: '30.00')
    validatedValue = rate.toFixed(2);
  } else if (settingKey.startsWith('MinWithdrawalAmount')) {
    const amount = parseFloat(validatedValue);
    if (Number.isNaN(amount) || amount < 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Số tiền rút tối thiểu không hợp lệ.'
      );
    }
    validatedValue = amount.toString();
  } else if (settingKey === 'InstructorSignupEnabled') {
    if (!['0', '1'].includes(validatedValue)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Giá trị cho phép đăng ký giảng viên không hợp lệ (0 hoặc 1).'
      );
    }
  }
  // Thêm các validate khác...

  // 3. Cập nhật setting
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
  getSettingValue, // Export để các service khác dùng
  updateSetting,
};
