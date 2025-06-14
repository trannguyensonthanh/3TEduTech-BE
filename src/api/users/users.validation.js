const Joi = require('joi');
const AccountStatus = require('../../core/enums/AccountStatus');
const Roles = require('../../core/enums/Roles');

// Update user profile validation
const updateUserProfile = {
  body: Joi.object()
    .keys({
      fullName: Joi.string().max(150).allow(null, ''),
      avatarUrl: Joi.string()
        .uri({ allowRelative: false })
        .max(500)
        .allow(null, ''),
      coverImageUrl: Joi.string()
        .uri({ allowRelative: false })
        .max(500)
        .allow(null, ''),
      gender: Joi.string().valid('MALE', 'FEMALE', 'OTHER').allow(null, ''),
      birthDate: Joi.date().iso().allow(null),
      phoneNumber: Joi.string()
        .pattern(/^[0-9+ -]{10,20}$/)
        .max(20)
        .allow(null, ''),
      headline: Joi.string().max(255).allow(null, ''),
      location: Joi.string().max(255).allow(null, ''),
    })
    .min(1),
};

// Admin Validations
const getUsers = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    searchTerm: Joi.string().allow(null, ''),
    role: Joi.string()
      .valid(...Object.values(Roles))
      .allow(null, ''),
    status: Joi.string()
      .valid(...Object.values(AccountStatus))
      .allow(null, ''),
  }),
};

const getUser = {
  params: Joi.object().keys({
    userId: Joi.number().integer().required(),
  }),
};

const updateUserStatus = {
  params: Joi.object().keys({
    userId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    status: Joi.string()
      .required()
      .valid(
        AccountStatus.ACTIVE,
        AccountStatus.INACTIVE,
        AccountStatus.BANNED
      ),
  }),
};

const updateUserRole = {
  params: Joi.object().keys({
    userId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    roleId: Joi.string()
      .required()
      .valid(...Object.values(Roles)),
  }),
};

module.exports = {
  updateUserProfile,
  getUsers,
  getUser,
  updateUserStatus,
  updateUserRole,
};
