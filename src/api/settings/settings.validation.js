const Joi = require('joi');

const getSettings = {
  // Không cần query params đặc biệt
};

const updateSetting = {
  params: Joi.object().keys({
    settingKey: Joi.string().required(), // Key trong URL
  }),
  body: Joi.object().keys({
    value: Joi.string().required(), // Giá trị mới gửi lên dạng string
  }),
};

module.exports = {
  getSettings,
  updateSetting,
};
