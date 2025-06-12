const Joi = require('joi');
const LessonType = require('../../core/enums/LessonType');

const id = Joi.number().integer().positive().required();
const lessonName = Joi.string().max(255).required();
const description = Joi.string().max(1000).allow('', null);
const url = Joi.string().uri().max(1000).allow('', null);
const boolean = Joi.boolean();
const videoDuration = Joi.number().integer().min(0).allow(null);
const textContent = Joi.string().max(10000);

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
    textContent: Joi.when('lessonType', {
      is: LessonType.TEXT,
      then: Joi.required(),
      otherwise: Joi.valid(null),
    }),
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
      videoSourceType: Joi.string().valid('YOUTUBE', 'VIMEO', 'CLOUDINARY'),
      externalVideoInput: Joi.string().max(1000).allow(null, ''),
      textContent: textContent.allow('', null),
      thumbnailUrl: url.allow(''),
      videoDurationSeconds: videoDuration,
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
