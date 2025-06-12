const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const skillsValidation = require('./skills.validation');
const skillsController = require('./skills.controller');
const {
  authenticate,
  authorize,
} = require('../../middlewares/auth.middleware');
const Roles = require('../../core/enums/Roles');

const router = express.Router();

/**
 * Lấy danh sách skills
 */
router.get(
  '/',
  validate(skillsValidation.getSkills),
  skillsController.getSkills
);

router.use(authenticate, authorize([Roles.ADMIN, Roles.SUPERADMIN]));

/**
 * Tạo skill mới
 */
router.post(
  '/',
  validate(skillsValidation.createSkill),
  skillsController.createSkill
);

/**
 * Lấy, cập nhật, hoặc xóa skill theo ID
 */
router
  .route('/:skillId')
  .get(validate(skillsValidation.getSkill), skillsController.getSkill)
  .patch(validate(skillsValidation.updateSkill), skillsController.updateSkill)
  .delete(validate(skillsValidation.deleteSkill), skillsController.deleteSkill);

module.exports = router;
