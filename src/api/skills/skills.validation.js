const Joi = require('joi');

const createSkill = {
  body: Joi.object().keys({
    skillName: Joi.string().required().max(100),
    description: Joi.string().max(500).allow(null, ''),
  }),
};

const getSkills = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(0), // 0 for all
    searchTerm: Joi.string().allow(null, ''),
  }),
};

const getSkill = {
  params: Joi.object().keys({
    skillId: Joi.number().integer().required(),
  }),
};

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
