const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const userValidation = require('./users.validation');
const userController = require('./users.controller');
const {
  authenticate,
  authorize,
} = require('../../middlewares/auth.middleware');
const Roles = require('../../core/enums/Roles');
const {
  handleMulterError,
  uploadImage,
} = require('../../middlewares/upload.middleware');

const router = express.Router();

// --- Routes for Current Logged-in User ---
router
  .route('/me')
  .get(authenticate, userController.getMyProfile) // Mọi user đã đăng nhập đều có thể lấy profile của mình
  .patch(
    authenticate,
    validate(userValidation.updateUserProfile),
    userController.updateMyProfile
  ); // Mọi user đã đăng nhập có thể cập nhật profile

// --- Route mới để Upload Avatar ---
router.patch(
  '/me/avatar',
  authenticate,
  uploadImage.single('avatar'), // Middleware nhận file từ field 'avatar'
  handleMulterError, // Middleware xử lý lỗi multer
  userController.updateMyAvatar // Controller method mới
);

// --- Routes for Admin ---
// Chỉ Admin và SuperAdmin mới có quyền truy cập các route này
router
  .route('/')
  .get(
    authenticate,
    authorize([Roles.ADMIN, Roles.SUPERADMIN]),
    validate(userValidation.getUsers),
    userController.getUsers
  );

router
  .route('/:userId')
  .get(
    authenticate,
    authorize([Roles.ADMIN, Roles.SUPERADMIN]),
    validate(userValidation.getUser),
    userController.getUser
  );
// Cân nhắc tách các route cập nhật status/role riêng
// .patch(authenticate, authorize([Roles.ADMIN, Roles.SUPERADMIN]), validate(userValidation.updateUser), userController.updateUser) // Có thể là route cập nhật chung
// .delete(authenticate, authorize([Roles.ADMIN, Roles.SUPERADMIN]), validate(userValidation.deleteUser), userController.deleteUser);

router.patch(
  '/:userId/status',
  authenticate,
  authorize([Roles.ADMIN, Roles.SUPERADMIN]),
  validate(userValidation.updateUserStatus),
  userController.updateUserStatus
);

router.patch(
  '/:userId/role',
  authenticate,
  authorize([Roles.ADMIN, Roles.SUPERADMIN]),
  validate(userValidation.updateUserRole),
  userController.updateUserRole
);

module.exports = router;
