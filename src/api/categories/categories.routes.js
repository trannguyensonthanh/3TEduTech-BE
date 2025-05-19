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

const router = express.Router();
const courseValidation = require('../courses/courses.validation'); // Thêm validation của courses (nếu cần cho query params)
const courseController = require('../courses/courses.controller'); // Thêm controller của courses
// Public route to get all categories (or maybe limited fields?)
router.get(
  '/',
  validate(categoryValidation.getCategories),
  categoryController.getCategories
); // Tạm thời mở cho tất cả

// Admin routes
router.post(
  '/',
  authenticate,
  authorize([Roles.ADMIN, Roles.SUPERADMIN]),
  validate(categoryValidation.createCategory),
  categoryController.createCategory
);

router
  .route('/:categoryId')
  .get(
    // authenticate, // Có thể mở public hoặc yêu cầu đăng nhập
    validate(categoryValidation.getCategory),
    categoryController.getCategory
  )
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
  '/slug/:categorySlug', // Phân biệt với route /:categoryId
  validate(categoryValidation.getCategoryBySlug), // Sẽ tạo validation này
  categoryController.getCategoryBySlug // Sẽ tạo controller method này
);

// --- Route mới: Lấy danh sách khóa học theo category slug ---
router.get(
  '/:categorySlug/courses',
  validate(courseValidation.getCoursesByCategorySlug), // Sẽ tạo validation này
  courseController.getCoursesByCategorySlug // Sẽ tạo controller method này
);

module.exports = router;
