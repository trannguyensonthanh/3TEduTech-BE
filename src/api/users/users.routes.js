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

// --- Route mới để Upload Avatar ---
router.post(
  '/me/avatar',
  authenticate,
  uploadImage.single('avatar'),
  handleMulterError,
  userController.updateMyAvatar
);

// --- Routes for Current Logged-in User ---
router
  .route('/me')
  .get(authenticate, userController.getMyProfile)
  .patch(
    authenticate,
    validate(userValidation.updateUserProfile),
    userController.updateMyProfile
  );

// --- Routes for Admin ---
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
