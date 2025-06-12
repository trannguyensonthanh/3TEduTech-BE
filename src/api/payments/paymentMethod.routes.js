const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const paymentMethodValidation = require('./paymentMethod.validation');
const paymentMethodController = require('./paymentMethod.controller');
const {
  authenticate,
  authorize,
} = require('../../middlewares/auth.middleware');
const Roles = require('../../core/enums/Roles');

const router = express.Router();

/**
 * Lấy danh sách các phương thức (Public/Authenticated User)
 */
router.get('/', paymentMethodController.getPaymentMethods);

router.use(authenticate, authorize([Roles.ADMIN, Roles.SUPERADMIN]));

/**
 * Tạo phương thức thanh toán mới
 */
router.post(
  '/',
  validate(paymentMethodValidation.createPaymentMethod),
  paymentMethodController.createPaymentMethod
);

/**
 * Lấy, cập nhật, xóa phương thức thanh toán theo ID
 */
router
  .route('/:methodId')
  .get(
    validate(paymentMethodValidation.getPaymentMethod),
    paymentMethodController.getPaymentMethod
  )
  .patch(
    validate(paymentMethodValidation.updatePaymentMethod),
    paymentMethodController.updatePaymentMethod
  )
  .delete(
    validate(paymentMethodValidation.deletePaymentMethod),
    paymentMethodController.deletePaymentMethod
  );

module.exports = router;
