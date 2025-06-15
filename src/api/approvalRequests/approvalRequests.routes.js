const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const courseValidation = require('../courses/courses.validation');
const courseController = require('../courses/courses.controller');
const {
  authenticate,
  authorize,
} = require('../../middlewares/auth.middleware');
const Roles = require('../../core/enums/Roles');

const router = express.Router();

router.use(
  authenticate,
  authorize([Roles.ADMIN, Roles.SUPERADMIN, Roles.INSTRUCTOR])
);

router.get(
  '/',
  validate(courseValidation.getApprovalRequests),
  courseController.getApprovalRequests
);

router.get(
  '/:requestId',
  validate(courseValidation.getApprovalRequest),
  courseController.getApprovalRequestDetails
);

router.patch(
  '/:requestId/review',
  validate(courseValidation.reviewCourse),
  courseController.reviewCourseApproval
);

module.exports = router;
