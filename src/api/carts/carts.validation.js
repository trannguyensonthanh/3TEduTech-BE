// file: src/api/carts/carts.validation.js

const Joi = require('joi');

const addCourseToCart = {
  body: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
};

const removeCourseFromCart = {
  params: Joi.object().keys({
    // Giả sử courseId nằm trong params
    courseId: Joi.number().integer().required(),
  }),
};

module.exports = {
  addCourseToCart,
  removeCourseFromCart,
};
