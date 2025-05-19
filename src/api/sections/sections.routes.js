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

const router = express.Router({ mergeParams: true }); // mergeParams để lấy courseId từ route cha

// Middleware xác thực và phân quyền áp dụng cho tất cả route quản lý section
// Chỉ Instructor sở hữu khóa học hoặc Admin mới được thao tác
router.use(authenticate);
// Kiểm tra quyền cụ thể hơn sẽ nằm trong service (checkCourseAccess)

// Tạo section mới cho một khóa học
router.post(
  '/',
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]), // Giảng viên hoặc Admin
  validate(sectionValidation.createSection),
  sectionController.createSection
);

// Cập nhật thứ tự các sections trong một khóa học
router.patch(
  '/order', // Route này nên nằm dưới course: /courses/:courseId/sections/order
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
      console.log('Request Params:', req.params); // In ra sectionId từ params
      console.log('Request Query:', req.query); // In ra query params nếu có
      console.log(req.body);
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

// Route lấy danh sách sections (thường không cần gọi riêng, tích hợp vào get course)
// Nếu cần thì thêm ở đây và xử lý quyền đọc
// router.get('/', validate(sectionValidation.getSections), sectionController.getSections);

module.exports = { sectionRouter: router };
