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

// Route lấy danh sách skills (có thể mở public hoặc yêu cầu login)
router.get(
  '/',
  validate(skillsValidation.getSkills),
  skillsController.getSkills
);

// Các routes cần quyền Admin
router.use(authenticate, authorize([Roles.ADMIN, Roles.SUPERADMIN]));

router.post(
  '/',
  validate(skillsValidation.createSkill),
  skillsController.createSkill
);

router
  .route('/:skillId')
  .get(validate(skillsValidation.getSkill), skillsController.getSkill)
  .patch(validate(skillsValidation.updateSkill), skillsController.updateSkill)
  .delete(validate(skillsValidation.deleteSkill), skillsController.deleteSkill);

module.exports = router;
