// File: src/api/courses/courses.routes.js

const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const courseValidation = require('./courses.validation');
const courseController = require('./courses.controller');
const {
  uploadImage,
  uploadVideo,
  handleMulterError,
} = require('../../middlewares/upload.middleware');
const {
  authenticate,
  authorize,
} = require('../../middlewares/auth.middleware');
const { courseScopedReviewRouter } = require('../reviews/reviews.routes');
const Roles = require('../../core/enums/Roles');
const passUserIfAuthenticated = require('../../middlewares/passUserIfAuthenticated');
const { sectionRouter } = require('../sections/sections.routes');
const { courseDiscussionRouter } = require('../discussions/discussions.routes');

const router = express.Router();

/**
 * Lấy tất cả khóa học (public hoặc user đã đăng nhập)
 */
router.get(
  '/',
  passUserIfAuthenticated,
  validate(courseValidation.getCourses),
  courseController.getCourses
);

/**
 * Lấy khóa học theo slug (public hoặc user đã đăng nhập)
 */
router.get(
  '/:slug',
  passUserIfAuthenticated,
  validate(courseValidation.getCourse),
  courseController.getCourse
);

/**
 * Tạo khóa học (chỉ Instructor/Superadmin)
 */
router.post(
  '/',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.SUPERADMIN]),
  validate(courseValidation.createCourse),
  courseController.createCourse
);

/**
 * Cập nhật khóa học (Instructor/Admin/Superadmin)
 */
router.patch(
  '/:courseId',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),
  validate(courseValidation.updateCourse),
  courseController.updateCourse
);

/**
 * Xóa khóa học (Instructor/Admin/Superadmin)
 */
router.delete(
  '/:courseId',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),
  validate(courseValidation.deleteCourse),
  courseController.deleteCourse
);

/**
 * Gửi duyệt khóa học (Instructor/Admin/Superadmin)
 */
router.post(
  '/:courseId/submit',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),
  validate(courseValidation.submitCourse),
  courseController.submitCourseForApproval
);

/**
 * Duyệt/từ chối khóa học (Admin/Superadmin)
 */
router.patch(
  '/reviews/:requestId',
  authenticate,
  authorize([Roles.ADMIN, Roles.SUPERADMIN]),
  validate(courseValidation.reviewCourse),
  courseController.reviewCourseApproval
);

/**
 * Đánh dấu khóa học nổi bật (Admin/Superadmin)
 */
router.patch(
  '/:courseId/feature',
  authenticate,
  authorize([Roles.ADMIN, Roles.SUPERADMIN]),
  validate(courseValidation.toggleFeature),
  courseController.toggleCourseFeature
);

/**
 * Upload thumbnail cho khóa học
 */
router.patch(
  '/:courseId/thumbnail',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),
  uploadImage.single('thumbnail'),
  handleMulterError,
  courseController.updateCourseThumbnail
);

/**
 * Upload video giới thiệu cho khóa học
 */
router.patch(
  '/:courseId/intro-video',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),
  uploadVideo.single('introVideo'),
  handleMulterError,
  courseController.updateCourseIntroVideo
);

/**
 * Lấy danh sách trạng thái khóa học
 */
router.get('/course-statuses/statuses', courseController.getCourseStatuses);

router.use('/:courseId/sections', sectionRouter);
router.use('/:courseId/reviews', courseScopedReviewRouter);
router.use('/:courseId/discussions', courseDiscussionRouter);

/**
 * Tìm yêu cầu phê duyệt đang chờ xử lý theo CourseID.
 */
router.get(
  '/:courseId/pending-approval-request',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),
  validate(courseValidation.findPendingApprovalRequestByCourseId), // sử dụng validate lấy courseId
  courseController.getPendingApprovalRequestByCourseId
);

router.post(
  '/:courseId/create-update-session',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),
  validate(courseValidation.deleteCourse), // Dùng validation lấy courseId là được
  courseController.createUpdateSession
);

// API hủy phiên cập nhật
router.post(
  '/:updateCourseId/cancel-update',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),
  validate(courseValidation.cancelUpdateCourse), // Dùng validation có param là courseId (đổi tên trong service)
  courseController.cancelUpdate
);

module.exports = router;
