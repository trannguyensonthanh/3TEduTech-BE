// file: src/api/carts/carts.validation.js

const Joi = require('joi');

/**
 * Validation for adding a course to cart
 */
const addCourseToCart = {
  body: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
};

/**
 * Validation for removing a course from cart
 */
const removeCourseFromCart = {
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
};

/**
 * Validation for clearing the cart
 */
const clearCart = {};

module.exports = {
  addCourseToCart,
  removeCourseFromCart,
  clearCart,
};
