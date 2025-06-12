const Joi = require('joi');

// Không cần query params đặc biệt
const getSettings = {};

const updateSetting = {
  params: Joi.object().keys({
    settingKey: Joi.string().required(),
  }),
  body: Joi.object().keys({
    value: Joi.string().required(),
  }),
};

module.exports = {
  getSettings,
  updateSetting,
};
