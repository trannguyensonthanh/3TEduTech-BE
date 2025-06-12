// File: src/api/enrollments/enrollments.routes.js

const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const enrollmentValidation = require('./enrollments.validation');
const enrollmentController = require('./enrollments.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

const router = express.Router();

/**
 * Lấy danh sách các khóa học user đã đăng ký
 */
router.get(
  '/me',
  authenticate,
  validate(enrollmentValidation.getMyEnrollments),
  enrollmentController.getMyEnrollments
);

/**
 * Đăng ký khóa học
 */
router.post(
  '/courses/:courseId',
  authenticate,
  validate(enrollmentValidation.createEnrollment),
  enrollmentController.enrollInCourse
);

module.exports = router;
