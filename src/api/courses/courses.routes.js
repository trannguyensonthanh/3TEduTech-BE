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
const passUserIfAuthenticated = require('../../middlewares/passUserIfAuthenticated'); // Sẽ tạo middleware này
const { sectionRouter } = require('../sections/sections.routes');
const { courseDiscussionRouter } = require('../discussions/discussions.routes');

const router = express.Router();

// --- Public Routes (or Authenticated User) ---
// Dùng middleware mới để lấy req.user nếu đã đăng nhập, không thì bỏ qua
// hàm này dùng để lấy tất cả khóa học
router.get(
  '/',
  passUserIfAuthenticated, // Lấy req.user nếu có token hợp lệ
  validate(courseValidation.getCourses),
  courseController.getCourses
);
// lây khóa học theo slug (có thể public hoặc cần login tùy logic free preview)
router.get(
  '/:slug',
  passUserIfAuthenticated, // Lấy req.user nếu có token hợp lệ
  validate(courseValidation.getCourse),
  courseController.getCourse
);

// --- Instructor Routes ---

router.post(
  '/',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.SUPERADMIN]), // Chỉ Instructor mới được tạo khóa học
  validate(courseValidation.createCourse),
  courseController.createCourse
);
// '/:courseId', // Cập nhật khóa học (Instructor/Admin)
router.patch(
  '/:courseId',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]), // Instructor và Admin đều có thể update (với quyền khác nhau)
  validate(courseValidation.updateCourse),
  courseController.updateCourse
);

//  '/:courseId', // Instructor xóa khóa học (có thể là xóa vĩnh viễn hoặc chỉ đánh dấu đã xóa)
router.delete(
  '/:courseId',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]), // Instructor và Admin đều có thể xóa (với quyền khác nhau)
  validate(courseValidation.deleteCourse),
  courseController.deleteCourse
);

//  '/:courseId/submit', // Instructor gửi duyệt
router.post(
  '/:courseId/submit', // Instructor gửi duyệt
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]), // Instructor và Admin đều có thể gửi duyệt (với quyền khác nhau)
  validate(courseValidation.submitCourse),
  courseController.submitCourseForApproval
);

// --- Admin Routes ---
// '/reviews/:requestId', // Admin duyệt/từ chối (dùng requestId)
router.patch(
  '/reviews/:requestId', // Admin duyệt/từ chối (dùng requestId)
  authenticate,
  authorize([Roles.ADMIN, Roles.SUPERADMIN]),
  validate(courseValidation.reviewCourse),
  courseController.reviewCourseApproval
);

// // Lấy danh sách khóa học chờ duyệt => vô dụng
// router.get(
//   '/reviews/pending-approval', // Đường dẫn riêng cho dễ phân biệt
//   authenticate,
//   authorize([Roles.ADMIN, Roles.SUPERADMIN]),
//   validate(courseValidation.getPendingCourses),
//   courseController.getPendingCourses // Controller mới
// );

//  '/:courseId/feature', // Admin đánh dấu nổi bật
router.patch(
  '/:courseId/feature', // Admin đánh dấu nổi bật
  authenticate,
  authorize([Roles.ADMIN, Roles.SUPERADMIN]),
  validate(courseValidation.toggleFeature),
  courseController.toggleCourseFeature
);

// --- Thêm Route Upload Thumbnail ---
//  '/:courseId/thumbnail', // Đường dẫn mới cho thumbnail
router.patch(
  '/:courseId/thumbnail',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),
  uploadImage.single('thumbnail'), // Middleware nhận file từ field 'thumbnail'
  handleMulterError, // Middleware xử lý lỗi multer *sau* uploadImage
  courseController.updateCourseThumbnail // Controller mới sẽ tạo
);

// --- Thêm Route Upload Intro Video ---
// '/:courseId/intro-video', // Đường dẫn mới cho video giới thiệu
router.patch(
  '/:courseId/intro-video',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),
  uploadVideo.single('introVideo'), // Middleware nhận file từ field 'introVideo'
  handleMulterError,
  courseController.updateCourseIntroVideo // Controller mới
);

// --- Route mới cho Sync Curriculum ---
router.put(
  '/:courseId/curriculum', // Sử dụng PUT để thay thế toàn bộ curriculum
  authenticate,
  // Chỉ instructor/admin
  (req, res, next) => {
    console.log('Request Body:', req.body);
    if (req.body.sections) {
      req.body.sections.forEach((section, index) => {
        console.log(`Section ${index + 1}:`, section);
        if (section.lessons) {
          console.log(`Lessons in Section ${index + 1}:`, section.lessons);
        }
      });
    }
    next(); // Chuyển tiếp request đến middleware tiếp theo
  },
  validate(courseValidation.syncCurriculum), // *** Cần tạo schema validation này ***
  courseController.syncCurriculum // *** Controller mới ***
);

router.get('/course-statuses/statuses', courseController.getCourseStatuses);

// Route mới: Lấy danh sách khóa học theo instructorId (thường dùng ID cho filter backend)
router.get(
  '/by-instructor/:instructorId',
  // passUserIfAuthenticated, // Tùy theo có cần public hay không
  validate(courseValidation.getCoursesByInstructor), // Cần tạo schema validation này
  courseController.getCoursesByInstructorId // Cần tạo controller method này
);

// Mount section routes vào courses/:courseId/sections
router.use('/:courseId/sections', sectionRouter);
router.use('/:courseId/reviews', courseScopedReviewRouter);
router.use('/:courseId/discussions', courseDiscussionRouter);
module.exports = router;
