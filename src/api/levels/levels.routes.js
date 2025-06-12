const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const levelValidation = require('./levels.validation');
const levelController = require('./levels.controller');
const {
  authenticate,
  authorize,
} = require('../../middlewares/auth.middleware');
const Roles = require('../../core/enums/Roles');

const router = express.Router();

// Public route to get all levels
router.get('/', levelController.getLevels);

router.post(
  '/',
  authenticate,
  authorize([Roles.ADMIN, Roles.SUPERADMIN]),
  validate(levelValidation.createLevel),
  levelController.createLevel
);

router
  .route('/:levelId')
  .get(validate(levelValidation.getLevel), levelController.getLevel)
  .patch(
    authenticate,
    authorize([Roles.ADMIN, Roles.SUPERADMIN]),
    validate(levelValidation.updateLevel),
    levelController.updateLevel
  )
  .delete(
    authenticate,
    authorize([Roles.ADMIN, Roles.SUPERADMIN]),
    validate(levelValidation.deleteLevel),
    levelController.deleteLevel
  );

module.exports = router;
