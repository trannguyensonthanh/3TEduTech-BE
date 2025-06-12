const Joi = require('joi');

/**
 * Validation for creating a level
 */
const createLevel = {
  body: Joi.object().keys({
    levelName: Joi.string().required().max(100),
  }),
};

/**
 * Validation for getting all levels
 */
const getLevels = {};

/**
 * Validation for getting a single level
 */
const getLevel = {
  params: Joi.object().keys({
    levelId: Joi.number().integer().required(),
  }),
};

/**
 * Validation for updating a level
 */
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

/**
 * Validation for deleting a level
 */
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
