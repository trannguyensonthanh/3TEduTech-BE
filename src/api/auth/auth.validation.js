const Joi = require('joi');
const Roles = require('../../core/enums/Roles');

/**
 * Validate register request
 */
const register = {
  body: Joi.object().keys({
    email: Joi.string().required().email().lowercase(),
    password: Joi.string().required().min(8).messages({
      'string.min': 'Mật khẩu phải có ít nhất 8 ký tự',
    }),
    fullName: Joi.string().required().max(150),
    roleId: Joi.string()
      .valid(...Object.values(Roles))
      .optional(),
  }),
};

/**
 * Validate login request
 */
const login = {
  body: Joi.object().keys({
    email: Joi.string().required().email().lowercase(),
    password: Joi.string().required(),
  }),
};

/**
 * Validate refresh tokens request
 */
const refreshTokens = {};

/**
 * Validate verify email request
 */
const verifyEmail = {
  query: Joi.object().keys({
    token: Joi.string().required(),
  }),
};

/**
 * Validate request password reset
 */
const requestPasswordReset = {
  body: Joi.object().keys({
    email: Joi.string().required().email().lowercase(),
  }),
};

/**
 * Validate reset password request
 */
const resetPassword = {
  query: Joi.object().keys({
    token: Joi.string().required(),
  }),
  body: Joi.object().keys({
    newPassword: Joi.string()
      .required()
      .min(8)
      .messages({ 'string.min': 'Mật khẩu mới phải có ít nhất 8 ký tự' }),
  }),
};

const instructorSkillSchema = Joi.alternatives().try(
  Joi.number().integer().positive(),
  Joi.string().trim().max(100)
);

const socialLinkSchema = Joi.object({
  platform: Joi.string().required().trim().uppercase().max(50),
  url: Joi.string().uri().required().max(500),
});

/**
 * Validate register instructor request
 */
const registerInstructor = {
  body: Joi.object().keys({
    email: Joi.string().required().email().lowercase(),
    password: Joi.string().required().min(8).messages({
      'string.min': 'Mật khẩu phải có ít nhất 8 ký tự',
    }),
    fullName: Joi.string().required().max(150),
    professionalTitle: Joi.string().max(255).allow(null, ''),
    bio: Joi.string().max(4000).allow(null, ''),
    skills: Joi.array().items(instructorSkillSchema).optional().allow(null),
    socialLinks: Joi.array().items(socialLinkSchema).optional().allow(null),
  }),
};

/**
 * Validate Google login request
 */
const googleLogin = {
  body: Joi.object().keys({
    idToken: Joi.string().required(),
  }),
};

/**
 * Validate Facebook login request
 */
const facebookLogin = {
  body: Joi.object().keys({
    accessToken: Joi.string().required(),
  }),
};

/**
 * Validate complete Facebook registration request
 */
const completeFacebookRegistration = {
  body: Joi.object().keys({
    accessToken: Joi.string().required(),
    email: Joi.string().required().email().lowercase(),
  }),
};

/**
 * Validate change password request
 */
const changePassword = {
  body: Joi.object().keys({
    currentPassword: Joi.string().required().messages({
      'string.empty': 'Mật khẩu hiện tại không được để trống.',
      'any.required': 'Mật khẩu hiện tại là bắt buộc.',
    }),
    newPassword: Joi.string().required().min(8).messages({
      'string.empty': 'Mật khẩu mới không được để trống.',
      'any.required': 'Mật khẩu mới là bắt buộc.',
      'string.min': 'Mật khẩu mới phải có ít nhất 8 ký tự',
    }),
    // confirmNewPassword: Joi.string()
    //   .required()
    //   .valid(Joi.ref('newPassword'))
    //   .messages({
    //     'string.empty': 'Xác nhận mật khẩu mới không được để trống.',
    //     'any.required': 'Xác nhận mật khẩu mới là bắt buộc.',
    //     'any.only': 'Xác nhận mật khẩu mới không khớp.',
    //   }),
  }),
};

module.exports = {
  register,
  login,
  refreshTokens,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  registerInstructor,
  googleLogin,
  facebookLogin,
  completeFacebookRegistration,
  changePassword,
};
