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
router.use(authenticate);

/**
 * Lấy tất cả settings
 */
router.get(
  '/',
  validate(settingsValidation.getSettings),
  settingsController.getSettings
);

router.use(authorize([Roles.ADMIN, Roles.SUPERADMIN]));

/**
 * Cập nhật một setting theo key
 */
router.patch(
  '/:settingKey',
  validate(settingsValidation.updateSetting),
  settingsController.updateSetting
);

module.exports = router;
