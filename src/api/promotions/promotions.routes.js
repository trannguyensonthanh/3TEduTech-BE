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
    // Tạo mới
    authenticate,
    authorize([Roles.ADMIN, Roles.SUPERADMIN]),
    validate(promotionValidation.createPromotion),
    promotionController.createPromotion
  )
  .get(
    // Lấy danh sách (Admin)
    authenticate,
    authorize([Roles.ADMIN, Roles.SUPERADMIN]),
    validate(promotionValidation.getPromotions),
    promotionController.getPromotions
  );

router
  .route('/:promotionId')
  .get(
    // Lấy chi tiết (Admin)
    authenticate,
    authorize([Roles.ADMIN, Roles.SUPERADMIN]),
    validate(promotionValidation.getPromotion),
    promotionController.getPromotion
  )
  .patch(
    // Cập nhật (Admin)
    authenticate,
    authorize([Roles.ADMIN, Roles.SUPERADMIN]),
    validate(promotionValidation.updatePromotion),
    promotionController.updatePromotion
  );

router.patch(
  '/:promotionId/deactivate', // Hủy kích hoạt (Admin)
  authenticate,
  authorize([Roles.ADMIN, Roles.SUPERADMIN]),
  validate(promotionValidation.deactivatePromotion),
  promotionController.deactivatePromotion
);

// --- User/Public Route (Optional) ---
// Ví dụ: Route để user kiểm tra mã giảm giá trước khi đặt hàng
router.post(
  '/validate-code',
  authenticate, // Yêu cầu đăng nhập để biết giỏ hàng của ai
  // validate(promotionValidation.validateCode), // Cần schema validation nếu có
  promotionController.validatePromotionCode
);

module.exports = router;
