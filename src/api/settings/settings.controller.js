const httpStatus = require('http-status').status;
const settingsService = require('./settings.service');
const { catchAsync } = require('../../utils/catchAsync');

const getSettings = catchAsync(async (req, res) => {
  const settings = await settingsService.getAllSettings();
  // Format lại nếu cần (vd: thành object { key: value })
  const settingsObject = settings.reduce((acc, setting) => {
    acc[setting.SettingKey] = {
      value: setting.SettingValue,
      description: setting.Description,
      isEditable: setting.IsEditableByAdmin,
      lastUpdated: setting.LastUpdated,
    };
    return acc;
  }, {});
  res.status(httpStatus.OK).send(settingsObject);
});

const updateSetting = catchAsync(async (req, res) => {
  const { settingKey } = req.params;
  const { value } = req.body;
  const updatedSetting = await settingsService.updateSetting(settingKey, value);
  res.status(httpStatus.OK).send(updatedSetting);
});

module.exports = {
  getSettings,
  updateSetting,
};
