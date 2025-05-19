// src/api/payments/paymentMethod.routes.js
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

// Lấy danh sách các phương thức (Public/Authenticated User)
router.get('/', paymentMethodController.getPaymentMethods);

// Các routes quản lý chỉ dành cho Admin
router.use(authenticate, authorize([Roles.ADMIN, Roles.SUPERADMIN]));

router.post(
  '/',
  validate(paymentMethodValidation.createPaymentMethod),
  paymentMethodController.createPaymentMethod
);

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
