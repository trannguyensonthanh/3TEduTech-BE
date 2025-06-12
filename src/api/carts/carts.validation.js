// file: src/api/carts/carts.validation.js

const Joi = require('joi');

const addCourseToCart = {
  body: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
};

const removeCourseFromCart = {
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
};

const clearCart = {};

module.exports = {
  addCourseToCart,
  removeCourseFromCart,
  clearCart,
};
