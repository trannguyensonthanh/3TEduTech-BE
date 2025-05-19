// src/api/languages/languages.validation.js
const Joi = require('joi');

const getLanguages = {
  query: Joi.object().keys({
    isActive: Joi.boolean().optional(),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(0), // 0 để lấy tất cả, hoặc min(1) nếu luôn phân trang
    sortBy: Joi.string().pattern(/^[a-zA-Z]+:(asc|desc)$/), // vd: 'DisplayOrder:asc'
  }),
};

const getLanguage = {
  params: Joi.object().keys({
    languageCode: Joi.string().required().max(10).trim().lowercase(),
  }),
};

const createLanguage = {
  body: Joi.object().keys({
    languageCode: Joi.string().required().max(10).trim().lowercase(),
    languageName: Joi.string().required().max(50),
    nativeName: Joi.string().max(50).allow(null, ''),
    isActive: Joi.boolean().optional(),
    displayOrder: Joi.number().integer().allow(null),
  }),
};

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
    .min(1), // Phải có ít nhất 1 trường để cập nhật
};

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
