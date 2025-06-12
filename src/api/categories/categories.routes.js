// File: src/api/categories/categories.routes.js

const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const categoryValidation = require('./categories.validation');
const categoryController = require('./categories.controller');
const {
  authenticate,
  authorize,
} = require('../../middlewares/auth.middleware');
const Roles = require('../../core/enums/Roles');
/**
 * Category and Course routes
 */
const router = express.Router();
const courseValidation = require('../courses/courses.validation');
const courseController = require('../courses/courses.controller');

router.get(
  '/',
  validate(categoryValidation.getCategories),
  categoryController.getCategories
);

router.post(
  '/',
  authenticate,
  authorize([Roles.ADMIN, Roles.SUPERADMIN]),
  validate(categoryValidation.createCategory),
  categoryController.createCategory
);

router
  .route('/:categoryId')
  .get(validate(categoryValidation.getCategory), categoryController.getCategory)
  .patch(
    authenticate,
    authorize([Roles.ADMIN, Roles.SUPERADMIN]),
    validate(categoryValidation.updateCategory),
    categoryController.updateCategory
  )
  .delete(
    authenticate,
    authorize([Roles.ADMIN, Roles.SUPERADMIN]),
    validate(categoryValidation.deleteCategory),
    categoryController.deleteCategory
  );

router.get(
  '/slug/:categorySlug',
  validate(categoryValidation.getCategoryBySlug),
  categoryController.getCategoryBySlug
);

router.get(
  '/:categorySlug/courses',
  validate(courseValidation.getCoursesByCategorySlug),
  courseController.getCoursesByCategorySlug
);

module.exports = router;
