const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const sectionValidation = require('./sections.validation');
const sectionController = require('./sections.controller');
const {
  authenticate,
  authorize,
} = require('../../middlewares/auth.middleware');
const Roles = require('../../core/enums/Roles');
const { sectionScopedLessonRouter } = require('../lessons/lessons.routes');

const router = express.Router({ mergeParams: true });

router.use(authenticate);

// Tạo section mới cho một khóa học
router.post(
  '/',
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),
  validate(sectionValidation.createSection),
  sectionController.createSection
);

// Cập nhật thứ tự các sections trong một khóa học
router.patch(
  '/order',
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),
  validate(sectionValidation.updateSectionsOrder),
  sectionController.updateSectionsOrder
);

// Các thao tác trên một section cụ thể
router
  .route('/:sectionId')
  .patch(
    authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),
    (req, res, next) => {
      next();
    },
    validate(sectionValidation.updateSection),
    sectionController.updateSection
  )
  .delete(
    authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),
    validate(sectionValidation.deleteSection),
    sectionController.deleteSection
  );

// Mount lesson routes (scoped) vào sections/:sectionId/lessons
router.use('/:sectionId/lessons', sectionScopedLessonRouter);

module.exports = { sectionRouter: router };
