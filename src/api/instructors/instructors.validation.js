const Joi = require('joi');

// Validation cho việc cập nhật profile giảng viên
const updateMyProfile = {
  body: Joi.object()
    .keys({
      // Từ UserProfile (ví dụ)
      headline: Joi.string().max(255).allow(null, ''),
      location: Joi.string().max(255).allow(null, ''),
      // Từ InstructorProfile
      professionalTitle: Joi.string().max(255).allow(null, ''),
      bio: Joi.string().max(4000).allow(null, ''), // Giới hạn độ dài
      aboutMe: Joi.string().allow(null, ''), // Có thể là HTML
      bankAccountNumber: Joi.string().max(50).allow(null, ''), // Cần mã hóa ở tầng nào đó
      bankName: Joi.string().max(100).allow(null, ''),
      bankAccountHolderName: Joi.string().max(150).allow(null, ''),
    })
    .min(1), // Phải có ít nhất 1 trường để cập nhật
};

const addSkill = {
  body: Joi.object().keys({
    skillId: Joi.number().integer().required(),
  }),
};

const removeSkill = {
  params: Joi.object().keys({
    skillId: Joi.number().integer().required(),
  }),
};

const addOrUpdateSocialLink = {
  body: Joi.object().keys({
    platform: Joi.string().required().max(50).trim().uppercase(), // Chuẩn hóa platform
    url: Joi.string().uri().required().max(500), // Yêu cầu URL hợp lệ
  }),
};

const removeSocialLink = {
  params: Joi.object().keys({
    platform: Joi.string().required().max(50), // Platform trong URL param
  }),
};

const getInstructorPublicProfile = {
  params: Joi.object().keys({
    instructorId: Joi.number().integer().required(),
  }),
};

const updateMyBankInfo = {
  body: Joi.object().keys({
    bankAccountNumber: Joi.string().required().max(50),
    bankName: Joi.string().required().max(100),
    bankAccountHolderName: Joi.string().required().max(150),
  }),
};

const getInstructors = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1),
    searchTerm: Joi.string().allow(''),
    skillId: Joi.number().integer(),
    minRating: Joi.number().min(0).max(5),
    sortBy: Joi.string().valid(
      'rating:desc',
      'studentCount:desc',
      'courseCount:desc',
      'name:asc',
      'name:desc'
    ),
    // Thêm các filter khác nếu cần
  }),
};

const getInstructorStudents = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    searchTerm: Joi.string().allow('').optional(),
    status: Joi.string().valid('ACTIVE', 'INACTIVE').optional(),
    courseId: Joi.number().integer().positive().optional().allow(null),
    sortBy: Joi.string()
      .valid(
        'fullName:asc',
        'fullName:desc',
        'lastActiveDate:asc',
        'lastActiveDate:desc',
        'averageCompletionRate:asc',
        'averageCompletionRate:desc',
        'enrolledCoursesCount:asc',
        'enrolledCoursesCount:desc'
      )
      .default('fullName:asc'),
  }),
};

module.exports = {
  updateMyProfile,
  addSkill,
  removeSkill,
  addOrUpdateSocialLink,
  removeSocialLink,
  getInstructorPublicProfile,
  updateMyBankInfo,
  getInstructors,
  getInstructorStudents,
};
