const Joi = require('joi');

const createSection = {
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    sectionName: Joi.string().required().max(255),
    description: Joi.string().allow(null, ''),
    sectionOrder: Joi.number().integer().min(0).required(), // Thứ tự section, bắt buộc và >= 0
  }),
};

const getSections = {
  // Lấy theo courseId
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
};

const updateSection = {
  params: Joi.object().keys({
    sectionId: Joi.number().integer().required(),
    courseId: Joi.number().integer().required(), // courseId cũng cần thiết để xác thực quyền truy cập
  }),
  body: Joi.object()
    .keys({
      sectionName: Joi.string().max(255),
      description: Joi.string().allow(null, ''),
    })
    .min(1), // Phải có ít nhất 1 trường
};

const deleteSection = {
  params: Joi.object().keys({
    sectionId: Joi.number().integer().required(),
  }),
};

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
    .required(), // Phải là mảng, có ít nhất 1 phần tử
};

module.exports = {
  createSection,
  getSections,
  updateSection,
  deleteSection,
  updateSectionsOrder,
};
