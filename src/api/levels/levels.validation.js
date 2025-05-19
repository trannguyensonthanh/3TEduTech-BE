const Joi = require('joi');

const createLevel = {
  body: Joi.object().keys({
    levelName: Joi.string().required().max(100),
  }),
};

const getLevels = {
  // No query params usually needed
};

const getLevel = {
  params: Joi.object().keys({
    levelId: Joi.number().integer().required(),
  }),
};

const updateLevel = {
  params: Joi.object().keys({
    levelId: Joi.number().integer().required(),
  }),
  body: Joi.object()
    .keys({
      levelName: Joi.string().required().max(100),
    })
    .min(1),
};

const deleteLevel = {
  params: Joi.object().keys({
    levelId: Joi.number().integer().required(),
  }),
};

module.exports = {
  createLevel,
  getLevels,
  getLevel,
  updateLevel,
  deleteLevel,
};
