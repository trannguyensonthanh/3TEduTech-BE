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
const reviewValidation = require('../reviews/reviews.validation');
const reviewController = require('../reviews/reviews.controller');

// --- Public Route ---
router.get(
  '/:instructorId/profile',
  validate(instructorValidation.getInstructorPublicProfile),
  instructorController.getInstructorPublicProfile
);

router.get(
  '/',
  validate(instructorValidation.getInstructors),
  instructorController.getInstructors
);

// --- Lấy tất cả reviews cho các khóa học của một giảng viên ---
router.get(
  '/:instructorId/course-reviews',
  validate(reviewValidation.getReviewsByInstructor),
  reviewController.getCourseReviewsByInstructor
);

// --- Routes require Instructor Role ---
router.use(authenticate, authorize([Roles.INSTRUCTOR, Roles.SUPERADMIN]));

// --- Student Management for Instructor ---
router.get(
  '/me/students',
  validate(instructorValidation.getInstructorStudents),
  instructorController.getMyStudents
);

// --- Profile Management ---
router
  .route('/me/profile')
  .get(instructorController.getMyProfile)
  .patch(
    validate(instructorValidation.updateMyProfile),
    instructorController.updateMyProfile
  );

// --- Skills Management ---
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

// --- Social Links Management ---
router.put(
  '/me/social-links',
  validate(instructorValidation.addOrUpdateSocialLink),
  instructorController.addOrUpdateMySocialLink
);
router.delete(
  '/me/social-links/:platform',
  validate(instructorValidation.removeSocialLink),
  instructorController.removeMySocialLink
);

// *** Mount Payout Method Routes ***
router.use('/me/payout-methods', payoutMethodRoutes);

// --- Instructor Dashboard Data / Financial Overview ---
router.get(
  '/me/financial-overview',
  instructorController.getMyFinancialOverview
);

module.exports = router;
