const Joi = require('joi');
const LessonType = require('../../core/enums/LessonType');

// 🎯 Khai báo các kiểu dữ liệu trước cho dễ dùng lại
const id = Joi.number().integer().positive().required();
const lessonName = Joi.string().max(255).required();
const description = Joi.string().max(1000).allow('', null);
const url = Joi.string().uri().max(1000).allow('', null);
const boolean = Joi.boolean();
const videoDuration = Joi.number().integer().min(0).allow(null);
const textContent = Joi.string().max(10000); // Tùy m muốn giới hạn bao nhiêu ký tự

// ✅ Joi schema cho tạo bài học
const createLesson = {
  params: Joi.object().keys({
    courseId: id,
    sectionId: id,
  }),
  body: Joi.object().keys({
    lessonName,
    description,
    lessonType: Joi.string()
      .required()
      .valid(...Object.values(LessonType)),

    // --- Trường riêng cho VIDEO ---
    videoSourceType: Joi.string()
      .valid('YOUTUBE', 'VIMEO', 'CLOUDINARY')
      .when('lessonType', {
        is: LessonType.VIDEO,
        then: Joi.required(),
        otherwise: Joi.forbidden(),
      }),
    externalVideoInput: Joi.string()
      .max(1000)
      .when('lessonType', {
        is: LessonType.VIDEO,
        then: Joi.allow(null, '').required(),
        otherwise: Joi.forbidden(),
      }),

    // --- Trường riêng cho TEXT ---
    textContent: Joi.when('lessonType', {
      is: LessonType.TEXT,
      then: Joi.required(),
      otherwise: Joi.valid(null),
    }),

    // --- Trường dùng chung ---
    thumbnailUrl: url,
    videoDurationSeconds: videoDuration,
    isFreePreview: boolean,
  }),
};

const getLessons = {
  params: Joi.object().keys({
    sectionId: id,
  }),
};

const getLesson = {
  params: Joi.object().keys({
    lessonId: id,
  }),
};

const updateLesson = {
  params: Joi.object().keys({
    lessonId: id,
  }),
  body: Joi.object()
    .keys({
      lessonName: Joi.string().max(255),
      description,
      lessonType: Joi.string().valid(...Object.values(LessonType)),
      isFreePreview: Joi.boolean(),
      videoSourceType: Joi.string().valid('YOUTUBE', 'VIMEO', 'CLOUDINARY'), // Chỉ cho phép đổi thành link ngoài qua API này
      // --- Trường mới cho video ---
      // Chỉ cho phép đổi thành link ngoài qua API này
      externalVideoInput: Joi.string().max(1000).allow(null, ''),
      // --- Trường mới cho text ---
      textContent: textContent.allow('', null), // Cho phép xóa text hoặc để null
      // --- Bỏ các trường cũ ---
      thumbnailUrl: url.allow(''), // Có thể cập nhật thumbnail
      videoDurationSeconds: videoDuration, // Có thể cập nhật duration
    })
    .min(1),
};

const deleteLesson = {
  params: Joi.object().keys({
    lessonId: id,
  }),
};

const updateLessonsOrder = {
  params: Joi.object().keys({
    sectionId: id,
  }),
  body: Joi.array()
    .items(
      Joi.object({
        id: Joi.number().integer().required(),
        order: Joi.number().integer().min(0).required(),
      })
    )
    .min(1)
    .required(),
};

module.exports = {
  createLesson,
  getLessons,
  getLesson,
  updateLesson,
  deleteLesson,
  updateLessonsOrder,
};
