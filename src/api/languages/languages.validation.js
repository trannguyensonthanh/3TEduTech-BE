const Joi = require('joi');

// Lấy danh sách ngôn ngữ
const getLanguages = {
  query: Joi.object().keys({
    isActive: Joi.boolean().optional(),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(0),
    sortBy: Joi.string().pattern(/^[a-zA-Z]+:(asc|desc)$/),
  }),
};

// Lấy thông tin ngôn ngữ theo mã
const getLanguage = {
  params: Joi.object().keys({
    languageCode: Joi.string().required().max(10).trim().lowercase(),
  }),
};

// Tạo mới ngôn ngữ
const createLanguage = {
  body: Joi.object().keys({
    languageCode: Joi.string().required().max(10).trim().lowercase(),
    languageName: Joi.string().required().max(50),
    nativeName: Joi.string().max(50).allow(null, ''),
    isActive: Joi.boolean().optional(),
    displayOrder: Joi.number().integer().allow(null),
  }),
};

// Cập nhật thông tin ngôn ngữ
const updateLanguage = {
  params: Joi.object().keys({
    languageCode: Joi.string().required().max(10).trim().lowercase(),
  }),
  body: Joi.object()
    .keys({
      languageName: Joi.string().max(50),
      nativeName: Joi.string().max(50).allow(null, ''),
      isActive: Joi.boolean(),
      displayOrder: Joi.number().integer().allow(null),
    })
    .min(1),
};

// Xóa ngôn ngữ
const deleteLanguage = {
  params: Joi.object().keys({
    languageCode: Joi.string().required().max(10).trim().lowercase(),
  }),
};

module.exports = {
  getLanguages,
  getLanguage,
  createLanguage,
  updateLanguage,
  deleteLanguage,
};
