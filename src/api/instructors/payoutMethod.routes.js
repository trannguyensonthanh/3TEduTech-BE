const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const payoutMethodValidation = require('./payoutMethod.validation');
const payoutMethodController = require('./payoutMethod.controller');
const {
  authenticate,
  authorize,
} = require('../../middlewares/auth.middleware');
const Roles = require('../../core/enums/Roles');

const router = express.Router();

// Các route này yêu cầu vai trò Instructor
router.use(authenticate, authorize([Roles.INSTRUCTOR]));

router
  .route('/')
  .get(payoutMethodController.getMyPayoutMethods)
  .post(
    validate(payoutMethodValidation.addPayoutMethod),
    payoutMethodController.addMyPayoutMethod
  );

router.patch(
  '/:payoutMethodId/set-primary',
  validate(payoutMethodValidation.setPrimary),
  payoutMethodController.setMyPrimaryPayoutMethod
);

router
  .route('/:payoutMethodId')
  .patch(
    validate(payoutMethodValidation.updatePayoutMethod),
    payoutMethodController.updateMyPayoutMethod
  )
  .put(
    // Dùng PUT để cập nhật chi tiết, vì nó mang tính thay thế object details
    validate(payoutMethodValidation.updatePayoutMethodDetails),
    payoutMethodController.updateMyPayoutMethodDetails
  )
  .delete(
    validate(payoutMethodValidation.deletePayoutMethod),
    payoutMethodController.deleteMyPayoutMethod
  );

module.exports = router;
