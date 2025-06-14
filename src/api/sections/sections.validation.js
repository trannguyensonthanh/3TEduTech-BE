const Joi = require('joi');

// Tạo section mới
const createSection = {
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    sectionName: Joi.string().required().max(255),
    description: Joi.string().allow(null, ''),
    sectionOrder: Joi.number().integer().min(0),
  }),
};

// Lấy section theo courseId
const getSections = {
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
};

// Cập nhật section
const updateSection = {
  params: Joi.object().keys({
    sectionId: Joi.number().integer().required(),
    courseId: Joi.number().integer().required(),
  }),
  body: Joi.object()
    .keys({
      sectionName: Joi.string().max(255),
      description: Joi.string().allow(null, ''),
    })
    .min(1),
};

// Xóa section
const deleteSection = {
  params: Joi.object().keys({
    sectionId: Joi.number().integer().required(),
    courseId: Joi.number().integer().required(),
  }),
};

// Cập nhật thứ tự các section
const updateSectionsOrder = {
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
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
  createSection,
  getSections,
  updateSection,
  deleteSection,
  updateSectionsOrder,
};
