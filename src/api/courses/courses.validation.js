// File: src/api/courses/courses.validation.js

const Joi = require('joi');
const objectId = require('joi-objectid')(Joi);
const CourseStatus = require('../../core/enums/CourseStatus');
const ApprovalStatus = require('../../core/enums/ApprovalStatus');
const LessonType = require('../../core/enums/LessonType');

const courseName = Joi.string().required().max(500);
const slug = Joi.string()
  .max(500)
  .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .optional()
  .allow(null, '')
  .messages({
    'string.pattern.base':
      'Slug chỉ được chứa chữ thường, số và dấu gạch ngang',
  });
const description = Joi.string().required();
const nvarcharMax = Joi.string().allow(null, '');
const url = Joi.string()
  .uri({ allowRelative: false })
  .max(1000)
  .allow(null, '');
const price = Joi.number().min(0).required();
const nullablePrice = Joi.number().min(0).allow(null);
const id = Joi.number().integer().required();

const language = Joi.string().max(10).default('vi');

/**
 * Validate create course payload
 */
const createCourse = {
  body: Joi.object().keys({
    courseName: Joi.string().required().max(500),
    categoryId: Joi.number().integer().positive().required(),
    language: Joi.string().max(10).required(),
    levelId: Joi.number().integer().positive().optional(),
  }),
};

/**
 * Validate get courses query
 */
const getCourses = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(0),
    searchTerm: Joi.string().allow(null, ''),
    categoryId: Joi.number().integer(),
    levelId: Joi.number().integer(),
    instructorId: Joi.number().integer(),
    statusId: Joi.string().valid(...Object.values(CourseStatus), 'ALL'),
    isFeatured: Joi.boolean(),
    sortBy: Joi.string()
      .pattern(/^[a-zA-Z]+:(asc|desc)$/)
      .default('CreatedAt:desc'),
    userPage: Joi.boolean().default(false),
  }),
};

/**
 * Validate get course by slug params
 */
const getCourse = {
  params: Joi.object().keys({
    slug: Joi.string().required(),
  }),
};

/**
 * Validate find pending approval request by courseId params
 */
const findPendingApprovalRequestByCourseId = {
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
};

/**
 * Validate update course payload
 */
const updateCourse = {
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
  body: Joi.object()
    .keys({
      courseName: Joi.string().max(500),
      categoryId: Joi.number().integer(),
      levelId: Joi.number().integer(),
      shortDescription: Joi.string(),
      fullDescription: Joi.string(),
      requirements: nvarcharMax,
      learningOutcomes: nvarcharMax,
      thumbnailUrl: url,
      introVideoUrl: url,
      originalPrice: Joi.number().min(0),
      discountedPrice: nullablePrice,
      language: Joi.string().max(10),
      slug,
      isFeatured: Joi.boolean(),
    })
    .min(1)
    .custom((value, helpers) => {
      const original =
        value.originalPrice ?? helpers.state.ancestors[0]?.originalPrice;
      const discounted = value.discountedPrice;
      if (
        original !== undefined &&
        discounted !== null &&
        discounted > original
      ) {
        return helpers.error('object.custom', {
          message: 'Giá giảm không được lớn hơn giá gốc',
        });
      }
      return value;
    })
    .messages({ 'object.custom': '{{#message}}' }),
};

/**
 * Validate delete course params
 */
const deleteCourse = {
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
};

/**
 * Validate cancel update course params
 */
const cancelUpdateCourse = {
  params: Joi.object().keys({
    updateCourseId: Joi.number().integer().required(),
  }),
};

/**
 * Validate submit course payload
 */
const submitCourse = {
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    notes: Joi.string().allow(null, ''),
  }),
};

/**
 * Validate review course payload
 */
const reviewCourse = {
  params: Joi.object().keys({
    requestId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    decision: Joi.string()
      .required()
      .valid(...Object.values(ApprovalStatus)),
    adminNotes: Joi.string().allow(null, ''),
  }),
};

/**
 * Validate get approval requests query
 */
const getApprovalRequests = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
    sortBy: Joi.string().pattern(/^[a-zA-Z]+:(asc|desc)$/),
    status: Joi.string().valid(...Object.values(ApprovalStatus)),
    instructorId: Joi.number().integer(),
    courseId: Joi.number().integer(),
    searchTerm: Joi.string().max(255).optional(),
  }),
};

/**
 * Validate get approval request params
 */
const getApprovalRequest = {
  params: Joi.object().keys({
    requestId: Joi.number().integer().required(),
  }),
};

/**
 * Validate toggle feature payload
 */
const toggleFeature = {
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    isFeatured: Joi.boolean().required(),
  }),
};

/**
 * Schema for quiz option payload
 */
const quizOptionPayloadSchema = Joi.object({
  tempId: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
  id: Joi.number().integer().optional().allow(null),
  optionText: Joi.string().required().max(500),
  isCorrectAnswer: Joi.boolean().required(),
  optionOrder: Joi.number().integer().min(0).required(),
});

/**
 * Schema for quiz question payload
 */
const quizQuestionPayloadSchema = Joi.object({
  tempId: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
  id: Joi.number().integer().optional().allow(null),
  questionText: Joi.string().required().max(4000),
  explanation: Joi.string().max(4000).optional().allow(null, ''),
  questionOrder: Joi.number().integer().min(0).required(),
  options: Joi.array()
    .items(quizOptionPayloadSchema)
    .min(2)
    .required()
    .custom((options, helpers) => {
      const correctCount = options.filter((o) => o.isCorrectAnswer).length;
      if (correctCount !== 1) {
        return helpers.error('array.quiz.oneCorrect');
      }
      return options;
    })
    .message('Each quiz question must have exactly one correct answer.'),
});

/**
 * Schema for attachment payload
 */
const attachmentPayloadSchema = Joi.object({
  tempId: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
  id: Joi.number().integer().optional().allow(null),
  fileName: Joi.string().required().max(255),
});

/**
 * Schema for subtitle payload
 */
const subtitlePayloadSchema = Joi.object({
  tempId: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
  id: Joi.number().integer().optional().allow(null),
  languageCode: Joi.string().required().max(10),
  languageName: Joi.string().required().max(50),
  subtitleUrl: Joi.string().uri().required().max(1000),
  isDefault: Joi.boolean().required(),
});

/**
 * Schema for lesson payload
 */
const lessonPayloadSchema = Joi.object({
  tempId: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
  id: Joi.number().integer().optional().allow(null),
  lessonName: Joi.string().required().max(255),
  description: Joi.string().max(4000).optional().allow(null, ''),
  lessonOrder: Joi.number().integer().min(0).required(),
  lessonType: Joi.string()
    .required()
    .valid(...Object.values(LessonType)),
  isFreePreview: Joi.boolean().required(),
  videoSourceType: Joi.string()
    .valid('CLOUDINARY', 'YOUTUBE', 'VIMEO')
    .optional()
    .allow(null),
  externalVideoInput: Joi.string().max(1000).optional().allow(null, ''),
  videoDurationSeconds: Joi.number().integer().min(0).optional().allow(null),
  thumbnailUrl: Joi.string().uri().max(500).optional().allow(null, ''),
  textContent: Joi.string().max(20000).optional().allow(null, ''),
  questions: Joi.array().items(quizQuestionPayloadSchema).optional(),
  attachments: Joi.array().items(attachmentPayloadSchema).optional(),
  subtitles: Joi.array().items(subtitlePayloadSchema).optional(),
})
  .when(Joi.object({ lessonType: Joi.valid('VIDEO') }).unknown(), {
    then: Joi.object({
      videoSourceType: Joi.required(),
      externalVideoInput: Joi.when('videoSourceType', {
        is: Joi.valid('YOUTUBE', 'VIMEO'),
        then: Joi.string().required().uri().messages({
          'string.empty': 'YouTube/Vimeo link is required',
          'string.uri': 'Invalid YouTube/Vimeo URL',
        }),
        otherwise: Joi.optional().allow(null, ''),
      }),
      textContent: Joi.forbidden(),
    }),
  })
  .when(Joi.object({ lessonType: Joi.valid('TEXT') }).unknown(), {
    then: Joi.object({
      textContent: Joi.string()
        .required()
        .min(1)
        .messages({ 'string.empty': 'Text content is required' }),
      videoSourceType: Joi.forbidden(),
      externalVideoInput: Joi.forbidden(),
      questions: Joi.forbidden(),
    }),
  })
  .when(Joi.object({ lessonType: Joi.valid('QUIZ') }).unknown(), {
    then: Joi.object({
      textContent: Joi.forbidden(),
      videoSourceType: Joi.forbidden(),
      externalVideoInput: Joi.forbidden(),
      questions: Joi.array()
        .required()
        .min(1)
        .messages({ 'array.min': 'Quiz must have at least one question' }),
    }),
  });

/**
 * Schema for section payload
 */
const sectionPayloadSchema = Joi.object({
  tempId: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
  id: Joi.number().integer().optional().allow(null),
  sectionName: Joi.string().required().max(255),
  description: Joi.string().max(4000).optional().allow(null, ''),
  sectionOrder: Joi.number().integer().min(0).required(),
  lessons: Joi.array().items(lessonPayloadSchema).required(),
});

/**
 * Validate get courses by category slug
 */
const getCoursesByCategorySlug = {
  params: Joi.object().keys({
    categorySlug: Joi.string().required(),
  }),
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1),
    sortBy: Joi.string(),
    levelId: Joi.number().integer(),
    language: Joi.string().max(10),
    minPrice: Joi.number().min(0),
    maxPrice: Joi.number().min(0),
    searchTerm: Joi.string().allow(''),
  }),
};

module.exports = {
  createCourse,
  getCourses,
  getCourse,
  updateCourse,
  deleteCourse,
  submitCourse,
  reviewCourse,
  getApprovalRequests,
  getApprovalRequest,
  toggleFeature,
  sectionPayloadSchema,
  getCoursesByCategorySlug,

  cancelUpdateCourse,
  findPendingApprovalRequestByCourseId,
};
