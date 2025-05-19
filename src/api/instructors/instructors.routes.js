const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const instructorValidation = require('./instructors.validation');
const instructorController = require('./instructors.controller');

const payoutMethodRoutes = require('./payoutMethod.routes');
const {
  authenticate,
  authorize,
} = require('../../middlewares/auth.middleware');
const Roles = require('../../core/enums/Roles');

const router = express.Router();
const reviewValidation = require('../reviews/reviews.validation'); // Thêm validation cho reviews
const reviewController = require('../reviews/reviews.controller'); // Thêm controller cho reviews
// --- Public Route ---
router.get(
  '/:instructorId/profile',
  validate(instructorValidation.getInstructorPublicProfile),
  instructorController.getInstructorPublicProfile
);

router.get(
  '/',
  // authenticate, // Mở public hoặc yêu cầu đăng nhập tùy theo yêu cầu
  validate(instructorValidation.getInstructors), // Sẽ định nghĩa schema này
  instructorController.getInstructors // Sẽ tạo controller method này
);

// Route mới: Lấy tất cả reviews cho các khóa học của một giảng viên
router.get(
  '/:instructorId/course-reviews', // Lấy theo instructorId
  // authenticate, // Xem xét việc yêu cầu đăng nhập
  // authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]), // Ai có quyền xem?
  validate(reviewValidation.getReviewsByInstructor), // Sẽ tạo schema validation này
  reviewController.getCourseReviewsByInstructor // Sẽ tạo controller method này
);

// --- Routes require Instructor Role ---
router.use(authenticate, authorize([Roles.INSTRUCTOR, Roles.SUPERADMIN]));

// Student Management for Instructor
router.get(
  '/me/students',
  validate(instructorValidation.getInstructorStudents), // You will need to create this validation schema
  instructorController.getMyStudents // You will need to create this controller method
);

// Profile Management
router
  .route('/me/profile')
  .get(instructorController.getMyProfile)
  .patch(
    validate(instructorValidation.updateMyProfile),
    instructorController.updateMyProfile
  );

// Skills Management
router.post(
  '/me/skills',
  validate(instructorValidation.addSkill),
  instructorController.addMySkill
);
router.delete(
  '/me/skills/:skillId',
  validate(instructorValidation.removeSkill),
  instructorController.removeMySkill
);

// Social Links Management
router.put(
  '/me/social-links', // Dùng PUT vì nó mang tính chất replace hoặc create
  validate(instructorValidation.addOrUpdateSocialLink),
  instructorController.addOrUpdateMySocialLink
);
router.delete(
  '/me/social-links/:platform',
  validate(instructorValidation.removeSocialLink),
  instructorController.removeMySocialLink
);

// Bank Info Management
// router
//   .route('/me/bank-info')
//   // .get(authenticate, authorize([Roles.INSTRUCTOR]), instructorController.getMyBankInfo) // Cần controller nếu muốn lấy riêng
//   .put(
//     // Dùng PUT vì đây là cập nhật toàn bộ thông tin bank
//     authenticate,
//     authorize([Roles.INSTRUCTOR]),
//     validate(instructorValidation.updateMyBankInfo),
//     instructorController.updateMyBankInfo
//   );

// *** Mount Payout Method Routes ***
router.use('/me/payout-methods', payoutMethodRoutes); // Mount vào /v1/instructors/me/payout-methods

// Instructor Dashboard Data / Financial Overview
router.get(
  '/me/financial-overview', // Đổi tên route cho rõ ràng
  // Không cần validation đặc biệt cho query params ở đây
  instructorController.getMyFinancialOverview
);

module.exports = router;
