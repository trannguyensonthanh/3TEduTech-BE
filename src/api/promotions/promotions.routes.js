const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const promotionValidation = require('./promotions.validation');
const promotionController = require('./promotions.controller');
const {
  authenticate,
  authorize,
} = require('../../middlewares/auth.middleware');
const Roles = require('../../core/enums/Roles');

const router = express.Router();

// --- Admin Routes ---
router
  .route('/')
  .post(
    authenticate,
    authorize([Roles.ADMIN, Roles.SUPERADMIN]),
    validate(promotionValidation.createPromotion),
    promotionController.createPromotion
  )
  .get(
    authenticate,
    authorize([Roles.ADMIN, Roles.SUPERADMIN]),
    validate(promotionValidation.getPromotions),
    promotionController.getPromotions
  );

router
  .route('/:promotionId')
  .get(
    authenticate,
    authorize([Roles.ADMIN, Roles.SUPERADMIN]),
    validate(promotionValidation.getPromotion),
    promotionController.getPromotion
  )
  .patch(
    authenticate,
    authorize([Roles.ADMIN, Roles.SUPERADMIN]),
    validate(promotionValidation.updatePromotion),
    promotionController.updatePromotion
  )
  .delete(
    authenticate,
    authorize([Roles.ADMIN, Roles.SUPERADMIN]),
    validate(promotionValidation.deletePromotion),
    promotionController.deletePromotion
  );

// Hủy kích hoạt (Admin)
router.patch(
  '/:promotionId/deactivate',
  authenticate,
  authorize([Roles.ADMIN, Roles.SUPERADMIN]),
  validate(promotionValidation.deactivatePromotion),
  promotionController.deactivatePromotion
);

// --- User/Public Route (Optional) ---
// Ví dụ: Route để user kiểm tra mã giảm giá trước khi đặt hàng
router.post(
  '/validate-code',
  authenticate,
  promotionController.validatePromotionCode
);

module.exports = router;
