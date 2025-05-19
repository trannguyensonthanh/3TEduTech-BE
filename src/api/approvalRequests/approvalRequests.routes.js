// src/api/approvalRequests/approvalRequests.routes.js
const express = require('express');
const validate = require('../../middlewares/validation.middleware');
// Import validation và controller từ courses hoặc tạo file riêng nếu muốn
const courseValidation = require('../courses/courses.validation');
const courseController = require('../courses/courses.controller');
const {
  authenticate,
  authorize,
} = require('../../middlewares/auth.middleware');
const Roles = require('../../core/enums/Roles');

const router = express.Router();

// Tất cả các route này yêu cầu quyền Admin
router.use(authenticate, authorize([Roles.ADMIN, Roles.SUPERADMIN]));

// Lấy danh sách yêu cầu
router.get(
  '/',
  validate(courseValidation.getApprovalRequests),
  courseController.getApprovalRequests
);

// Lấy chi tiết một yêu cầu
router.get(
  '/:requestId',
  validate(courseValidation.getApprovalRequest),
  courseController.getApprovalRequestDetails
);

// Duyệt/Từ chối một yêu cầu
router.patch(
  '/:requestId/review',
  validate(courseValidation.reviewCourse),
  courseController.reviewCourseApproval
);

module.exports = router;
