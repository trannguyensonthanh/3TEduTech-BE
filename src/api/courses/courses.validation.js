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
  .allow(null, ''); // Tăng max length
const price = Joi.number().min(0).required();
const nullablePrice = Joi.number().min(0).allow(null);
const id = Joi.number().integer().required();

const language = Joi.string().max(10).default('vi');

const createCourse = {
  body: Joi.object().keys({
    courseName,
    slug: slug.custom((value, helpers) => {
      if (
        value !== null &&
        value !== '' &&
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
      ) {
        return helpers.error('string.pattern.base'); // Định dạng slug không hợp lệ
      }
      return value;
    }),
    categoryId: id,
    levelId: id,
    shortDescription: description.max(500),
    fullDescription: description,
    requirements: nvarcharMax,
    learningOutcomes: nvarcharMax,
    thumbnailUrl: url,
    introVideoUrl: url,
    originalPrice: price,
    discountedPrice: nullablePrice
      .custom((value, helpers) => {
        const { originalPrice } = helpers.state.ancestors[0];
        if (value !== null && value > originalPrice) {
          return helpers.error('number.max', { limit: originalPrice });
        }
        return value;
      })
      .messages({ 'number.max': 'Giá giảm không được lớn hơn giá gốc' }),
    language,
    // InstructorID lấy từ req.user, StatusID mặc định là DRAFT
  }),
};

const getCourses = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(0), // 0 để lấy tất cả
    searchTerm: Joi.string().allow(null, ''),
    categoryId: Joi.number().integer(),
    levelId: Joi.number().integer(),
    instructorId: Joi.number().integer(),
    statusId: Joi.string().valid(...Object.values(CourseStatus), 'ALL'), // Thêm 'ALL'
    isFeatured: Joi.boolean(),
    sortBy: Joi.string()
      .pattern(/^[a-zA-Z]+:(asc|desc)$/)
      .default('CreatedAt:desc'), // vd: Price:asc
    userPage: Joi.boolean().default(false), // true nếu là trang của user (Instructor/Admin)
  }),
};

const getCourse = {
  // Dùng slug để lấy chi tiết
  params: Joi.object().keys({
    slug: Joi.string().required(),
  }),
};

const updateCourse = {
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
  body: Joi.object()
    .keys({
      courseName: Joi.string().max(500),
      categoryId: Joi.number().integer(),
      levelId: Joi.number().integer(),
      shortDescription: Joi.string().max(500),
      fullDescription: Joi.string(),
      requirements: nvarcharMax,
      learningOutcomes: nvarcharMax,
      thumbnailUrl: url,
      introVideoUrl: url,
      originalPrice: Joi.number().min(0),
      discountedPrice: nullablePrice,
      language: Joi.string().max(10),
      // Slug sẽ tự động cập nhật nếu courseName đổi, hoặc có thể cho phép cập nhật riêng slug
      slug, // Cho phép cập nhật slug riêng
      // Các trường chỉ Admin được đổi (statusId, isFeatured) không nên validate ở đây
      // mà kiểm tra quyền trong service
    })
    .min(1)
    .custom((value, helpers) => {
      // Validate discountedPrice <= originalPrice nếu cả 2 đều được cung cấp
      const original =
        value.originalPrice ?? helpers.state.ancestors[0]?.originalPrice; // Lấy giá gốc từ body hoặc từ context (nếu service truyền vào)
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

const deleteCourse = {
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
};

// --- Approval Validations ---
const submitCourse = {
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    notes: Joi.string().allow(null, ''),
  }),
};

const reviewCourse = {
  params: Joi.object().keys({
    // Nên dùng requestId thay vì courseId để review
    requestId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    decision: Joi.string()
      .required()
      .valid(...Object.values(ApprovalStatus)),
    adminNotes: Joi.string().allow(null, ''),
  }),
};

const getApprovalRequests = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
    sortBy: Joi.string().pattern(/^[a-zA-Z]+:(asc|desc)$/),
    status: Joi.string().valid(...Object.values(ApprovalStatus)), // Lọc theo trạng thái duyệt
    instructorId: Joi.number().integer(), // Lọc theo giảng viên
    courseId: Joi.number().integer(), // Lọc theo khóa học
    searchTerm: Joi.string().max(255).optional(), // Tìm kiếm theo từ khóa
  }),
};

const getApprovalRequest = {
  params: Joi.object().keys({
    requestId: Joi.number().integer().required(),
  }),
};

// --- Feature Validation ---
const toggleFeature = {
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    isFeatured: Joi.boolean().required(),
  }),
};

// --- Schema cho các thực thể con trong payload ---
const quizOptionPayloadSchema = Joi.object({
  tempId: Joi.alternatives().try(Joi.string(), Joi.number()).optional(), // ID tạm từ FE (optional)
  id: Joi.number().integer().optional().allow(null), // ID thật từ DB (nếu đã có)
  optionText: Joi.string().required().max(500),
  isCorrectAnswer: Joi.boolean().required(),
  optionOrder: Joi.number().integer().min(0).required(), // Thứ tự gửi từ FE
});

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
      // Validate chỉ có 1 đáp án đúng
      const correctCount = options.filter((o) => o.isCorrectAnswer).length;
      if (correctCount !== 1) {
        return helpers.error('array.quiz.oneCorrect');
      }
      return options;
    })
    .message('Each quiz question must have exactly one correct answer.'),
});

const attachmentPayloadSchema = Joi.object({
  tempId: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
  id: Joi.number().integer().optional().allow(null),
  fileName: Joi.string().required().max(255),
  // fileUrl, fileType, fileSize, cloudStorageId sẽ được set ở backend khi upload thành công
});

const subtitlePayloadSchema = Joi.object({
  tempId: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
  id: Joi.number().integer().optional().allow(null),
  languageCode: Joi.string().required().max(10),
  languageName: Joi.string().required().max(50),
  subtitleUrl: Joi.string().uri().required().max(1000), // Chỉ nhận URL ở đây
  isDefault: Joi.boolean().required(),
});

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
  // Video specific
  videoSourceType: Joi.string()
    .valid('CLOUDINARY', 'YOUTUBE', 'VIMEO')
    .optional()
    .allow(null),
  externalVideoInput: Joi.string().max(1000).optional().allow(null, ''), // Link YT/Vimeo hoặc public_id Cloudinary cũ
  // lessonVideo (File) không gửi qua đây
  videoDurationSeconds: Joi.number().integer().min(0).optional().allow(null), // BE tự tính toán là chính
  thumbnailUrl: Joi.string().uri().max(500).optional().allow(null, ''), // Thumbnail bài học
  // Text specific
  textContent: Joi.string().max(20000).optional().allow(null, ''),
  // Sub-entities
  questions: Joi.array().items(quizQuestionPayloadSchema).optional(),
  attachments: Joi.array().items(attachmentPayloadSchema).optional(), // Chỉ gửi metadata, không gửi file
  subtitles: Joi.array().items(subtitlePayloadSchema).optional(),
})
  // Validate thêm: Nếu lessonType là VIDEO thì phải có videoSourceType (trừ khi đã có id và ko đổi type?)
  // Validate thêm: Nếu sourceType là YT/Vimeo thì phải có externalVideoInput
  // Validate thêm: Nếu lessonType là TEXT thì phải có textContent
  .when(Joi.object({ lessonType: Joi.valid('VIDEO') }).unknown(), {
    then: Joi.object({
      videoSourceType: Joi.required(),
      externalVideoInput: Joi.when('videoSourceType', {
        is: Joi.valid('YOUTUBE', 'VIMEO'),
        then: Joi.string().required().uri().messages({
          'string.empty': 'YouTube/Vimeo link is required',
          'string.uri': 'Invalid YouTube/Vimeo URL',
        }),
        otherwise: Joi.optional().allow(null, ''), // Cho Cloudinary
      }),
      textContent: Joi.forbidden(), // Không được có text
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

const sectionPayloadSchema = Joi.object({
  tempId: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
  id: Joi.number().integer().optional().allow(null),
  sectionName: Joi.string().required().max(255),
  description: Joi.string().max(4000).optional().allow(null, ''),
  sectionOrder: Joi.number().integer().min(0).required(),
  lessons: Joi.array().items(lessonPayloadSchema).required(), // Mảng lessons
});

// Schema chính cho API Sync
const syncCurriculum = {
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    sections: Joi.array()
      .items(sectionPayloadSchema)
      .required()
      .custom((sections, helpers) => {
        // ===== Validate sectionOrder =====
        const sectionOrders = sections.map((s) => s.sectionOrder);
        const isSectionOrderSequential =
          new Set(sectionOrders).size === sectionOrders.length &&
          sectionOrders.length > 0 &&
          Math.min(...sectionOrders) === 0 &&
          sectionOrders
            .sort((a, b) => a - b)
            .every((order, index) => order === index);

        if (!isSectionOrderSequential) {
          return helpers.error('array.sequentialOrder', { context: 'Section' });
        }

        // ===== Validate lessonOrder trong từng section =====
        for (const section of sections) {
          const lessonOrders = section.lessons?.map((l) => l.lessonOrder) ?? [];

          if (lessonOrders.length > 0) {
            const isLessonOrderSequential =
              new Set(lessonOrders).size === lessonOrders.length &&
              Math.min(...lessonOrders) === 0 &&
              lessonOrders
                .sort((a, b) => a - b)
                .every((order, index) => order === index);

            if (!isLessonOrderSequential) {
              return helpers.error('array.sequentialOrder', {
                context: `Lesson in section "${section.sectionName}"`,
              });
            }
          }

          // ===== Validate questionOrder trong từng lesson QUIZ =====
          for (const lesson of section.lessons.filter(
            (l) => l.lessonType === 'QUIZ' && Array.isArray(l.questions)
          )) {
            const questionOrders = lesson.questions.map((q) => q.questionOrder);

            if (questionOrders.length > 0) {
              const isQuestionOrderSequential =
                new Set(questionOrders).size === questionOrders.length &&
                Math.min(...questionOrders) === 0 &&
                questionOrders
                  .sort((a, b) => a - b)
                  .every((order, index) => order === index);

              if (!isQuestionOrderSequential) {
                return helpers.error('array.sequentialOrder', {
                  context: `Question in lesson "${lesson.lessonName}"`,
                });
              }
            }
          }
        }

        return sections;
      })
      .message(
        '{{#context}} order must be unique, sequential and start from 0.'
      ),
  }),
};

// const getPendingCourses = {
//   query: Joi.object().keys({
//     page: Joi.number().integer().min(1),
//     limit: Joi.number().integer().min(1).max(100), // Giới hạn số lượng lấy về
//     sortBy: Joi.string()
//       .pattern(/^[a-zA-Z]+:(asc|desc)$/)
//       .default('CreatedAt:asc'), // Mặc định cũ trước
//   }),
// };

const getCoursesByCategorySlug = {
  params: Joi.object().keys({
    categorySlug: Joi.string().required(),
  }),
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1),
    sortBy: Joi.string(), // ví dụ: 'PublishedAt:desc', 'AverageRating:desc'
    // Thêm các filter khác nếu cần, ví dụ: levelId, minPrice, maxPrice
    levelId: Joi.number().integer(),
    language: Joi.string().max(10),
    minPrice: Joi.number().min(0),
    maxPrice: Joi.number().min(0),
    searchTerm: Joi.string().allow(''),
  }),
};

const getCoursesByInstructor = {
  params: Joi.object().keys({
    instructorId: Joi.alternatives()
      .try(Joi.number().integer(), objectId())
      .required(), // ID của giảng viên
  }),
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1),
    sortBy: Joi.string(), // ví dụ: 'PublishedAt:desc', 'AverageRating:desc'
    statusId: Joi.string().valid(...Object.values(CourseStatus)), // Lọc theo trạng thái khóa học (PUBLISHED, DRAFT, PENDING_APPROVAL)
    searchTerm: Joi.string().allow(''),
    // Thêm các filter khác nếu cần cho các khóa học của giảng viên này
  }),
};

module.exports = {
  createCourse,
  getCourses,
  getCourse,
  updateCourse,
  deleteCourse,
  // Approval
  submitCourse,
  reviewCourse,
  getApprovalRequests,
  getApprovalRequest,
  // Feature
  toggleFeature,
  // getPendingCourses,
  // Sync Curriculum
  syncCurriculum,
  getCoursesByCategorySlug,
  getCoursesByInstructor,
};
