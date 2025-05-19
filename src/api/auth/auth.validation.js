// đường dẫn đến file auth.validation.js

const Joi = require('joi');
const Roles = require('../../core/enums/Roles'); // Import Roles enum

const register = {
  body: Joi.object().keys({
    email: Joi.string().required().email().lowercase(),
    password: Joi.string()
      .required()
      .min(8)
      // .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\\$%\\^&\\*])')) // Regex mạnh hơn nếu cần
      .messages({
        'string.min': 'Mật khẩu phải có ít nhất 8 ký tự',
        // 'string.pattern.base': 'Mật khẩu phải chứa chữ hoa, chữ thường, số và ký tự đặc biệt',
      }),
    fullName: Joi.string().required().max(150),
    roleId: Joi.string()
      .valid(...Object.values(Roles))
      .optional(), // Cho phép role khi đăng ký nếu cần
  }),
};

const login = {
  body: Joi.object().keys({
    email: Joi.string().required().email().lowercase(),
    password: Joi.string().required(),
  }),
};

const refreshTokens = {
  // body: Joi.object().keys({
  //   refreshToken: Joi.string().required(),
  // }),
};

const verifyEmail = {
  query: Joi.object().keys({
    // Token thường được gửi qua query param
    token: Joi.string().required(),
  }),
};

const requestPasswordReset = {
  body: Joi.object().keys({
    email: Joi.string().required().email().lowercase(),
  }),
};

const resetPassword = {
  query: Joi.object().keys({
    // Token thường được gửi qua query param
    token: Joi.string().required(),
  }),
  body: Joi.object().keys({
    newPassword: Joi.string()
      .required()
      .min(8)
      .messages({ 'string.min': 'Mật khẩu mới phải có ít nhất 8 ký tự' }),
  }),
};

// --- Schema mới cho đăng ký Instructor ---
// Định nghĩa schema cho skill (có thể là ID hoặc tên skill mới)
const instructorSkillSchema = Joi.alternatives().try(
  Joi.number().integer().positive(), // Skill ID đã có
  Joi.string().trim().max(100) // Tên skill mới (sẽ xử lý ở service)
);

// Định nghĩa schema cho social link
const socialLinkSchema = Joi.object({
  platform: Joi.string().required().trim().uppercase().max(50), // Chuẩn hóa platform
  url: Joi.string().uri().required().max(500),
});

const registerInstructor = {
  body: Joi.object().keys({
    // Thông tin Account & User Profile cơ bản
    email: Joi.string().required().email().lowercase(),
    password: Joi.string().required().min(8).messages({
      'string.min': 'Mật khẩu phải có ít nhất 8 ký tự',
    }),
    fullName: Joi.string().required().max(150),

    // Thông tin Instructor Profile (Optional)
    professionalTitle: Joi.string().max(255).allow(null, ''),
    bio: Joi.string().max(4000).allow(null, ''), // Giới hạn độ dài bio
    // aboutMe: Joi.string().allow(null, ''), // Có thể thêm sau

    // Thông tin Skills (Optional - Mảng các Skill ID hoặc Tên Skill)
    skills: Joi.array().items(instructorSkillSchema).optional().allow(null),

    // Thông tin Social Links (Optional - Mảng các object {platform, url})
    socialLinks: Joi.array().items(socialLinkSchema).optional().allow(null),

    // Không cho phép tự chọn RoleID ở đây
  }),
};

// --- Schema mới cho Social Login ---
const googleLogin = {
  body: Joi.object().keys({
    idToken: Joi.string().required(), // *** Nhận ID Token ***
  }),
};

const facebookLogin = {
  body: Joi.object().keys({
    accessToken: Joi.string().required(), // Nhận Access Token từ frontend
    // Có thể thêm userId nếu cần gửi từ frontend
    // userId: Joi.string().required(),
  }),
};

// --- Schema mới cho hoàn tất đăng ký Facebook ---
const completeFacebookRegistration = {
  body: Joi.object().keys({
    accessToken: Joi.string().required(), // Access Token Facebook từ frontend
    email: Joi.string().required().email().lowercase(), // Email người dùng tự nhập
  }),
};

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
      // Thêm các messages từ custom(password) nếu cần
    }),
    confirmNewPassword: Joi.string()
      .required()
      .valid(Joi.ref('newPassword'))
      .messages({
        'string.empty': 'Xác nhận mật khẩu mới không được để trống.',
        'any.required': 'Xác nhận mật khẩu mới là bắt buộc.',
        'any.only': 'Xác nhận mật khẩu mới không khớp.',
      }),
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
