const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const settingsValidation = require('./settings.validation');
const settingsController = require('./settings.controller');
const {
  authenticate,
  authorize,
} = require('../../middlewares/auth.middleware');
const Roles = require('../../core/enums/Roles');

const router = express.Router();

// Tất cả các route này yêu cầu quyền Admin/SuperAdmin
router.use(authenticate, authorize([Roles.ADMIN, Roles.SUPERADMIN]));

// Lấy tất cả settings
router.get(
  '/',
  validate(settingsValidation.getSettings), // Validation có thể rỗng
  settingsController.getSettings
);

// Cập nhật một setting theo key
router.patch(
  '/:settingKey',
  validate(settingsValidation.updateSetting),
  settingsController.updateSetting
);

module.exports = router;
