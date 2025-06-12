// src/api/lessons/subtitle.validation.js
const Joi = require('joi');

const addSubtitle = {
  params: Joi.object().keys({
    lessonId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    languageCode: Joi.string().required().max(10).trim().lowercase(),
    subtitleUrl: Joi.string()
      .uri({ allowRelative: false })
      .required()
      .max(1000),
    isDefault: Joi.boolean().optional(),
  }),
};

const getSubtitles = {
  params: Joi.object().keys({
    lessonId: Joi.number().integer().required(),
  }),
};

const setPrimary = {
  params: Joi.object().keys({
    lessonId: Joi.number().integer().required(),
    subtitleId: Joi.number().integer().required(),
  }),
};

const deleteSubtitle = {
  params: Joi.object().keys({
    lessonId: Joi.number().integer().required(),
    subtitleId: Joi.number().integer().required(),
  }),
};

module.exports = {
  addSubtitle,
  getSubtitles,
  setPrimary,
  deleteSubtitle,
};
