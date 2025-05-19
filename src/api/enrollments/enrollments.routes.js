// File: src/api/enrollments/enrollments.routes.js

const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const enrollmentValidation = require('./enrollments.validation');
const enrollmentController = require('./enrollments.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Route để lấy danh sách các khóa học user đã đăng ký
// Có thể đặt là /users/me/enrollments hoặc /enrollments/me
router.get(
  '/me',
  authenticate,
  validate(enrollmentValidation.getMyEnrollments),
  enrollmentController.getMyEnrollments
);

// Route để user tự enroll (chỉ nên dùng cho test hoặc khóa miễn phí)
// Thường thì enroll sẽ nằm trong module Courses hoặc được gọi từ Payment service
router.post(
  '/courses/:courseId',
  authenticate, // Cần đăng nhập để enroll
  validate(enrollmentValidation.createEnrollment),
  enrollmentController.enrollInCourse
);

module.exports = router;
