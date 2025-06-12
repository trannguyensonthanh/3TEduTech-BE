const Joi = require('joi');

/**
 * Validation for creating a skill
 */
const createSkill = {
  body: Joi.object().keys({
    skillName: Joi.string().required().max(100),
    description: Joi.string().max(500).allow(null, ''),
  }),
};

/**
 * Validation for getting skills
 */
const getSkills = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(0),
    searchTerm: Joi.string().allow(null, ''),
  }),
};

/**
 * Validation for getting a single skill
 */
const getSkill = {
  params: Joi.object().keys({
    skillId: Joi.number().integer().required(),
  }),
};

/**
 * Validation for updating a skill
 */
const updateSkill = {
  params: Joi.object().keys({
    skillId: Joi.number().integer().required(),
  }),
  body: Joi.object()
    .keys({
      skillName: Joi.string().max(100),
      description: Joi.string().max(500).allow(null, ''),
    })
    .min(1),
};

/**
 * Validation for deleting a skill
 */
const deleteSkill = {
  params: Joi.object().keys({
    skillId: Joi.number().integer().required(),
  }),
};

module.exports = {
  createSkill,
  getSkills,
  getSkill,
  updateSkill,
  deleteSkill,
};
