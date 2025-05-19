// File: src/api/financials/financials.routes.js

const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const financialsValidation = require('./financials.validation');
const financialsController = require('./financials.controller');
const {
  authenticate,
  authorize,
} = require('../../middlewares/auth.middleware');
const Roles = require('../../core/enums/Roles');

const router = express.Router();

// --- Instructor Routes ---
// Các route này yêu cầu đăng nhập và vai trò là INSTRUCTOR
router.get(
  '/balance',
  authenticate,
  authorize([Roles.INSTRUCTOR]),
  financialsController.getMyAvailableBalance
);

router.post(
  '/withdrawals/request',
  authenticate,
  authorize([Roles.INSTRUCTOR]),
  validate(financialsValidation.requestWithdrawal),
  financialsController.requestWithdrawal
);

// --- Admin Routes ---
// Các route này yêu cầu đăng nhập và vai trò ADMIN/SUPERADMIN
// Ví dụ: xem và xử lý yêu cầu rút tiền
router.patch(
  '/withdrawals/:requestId/review',
  authenticate,
  authorize([Roles.ADMIN, Roles.SUPERADMIN]),
  validate(financialsValidation.reviewWithdrawal),
  financialsController.reviewWithdrawalRequest
);

// --- Thêm Admin Routes cho Payout Management ---
router.get(
  '/payouts', // Lấy danh sách payouts
  authenticate,
  authorize([Roles.ADMIN, Roles.SUPERADMIN]),
  validate(financialsValidation.getPayouts),
  financialsController.getPayouts
);

router.patch(
  '/payouts/:payoutId/process', // Đánh dấu đã xử lý chi trả
  authenticate,
  authorize([Roles.ADMIN, Roles.SUPERADMIN]),
  validate(financialsValidation.processPayout),
  financialsController.processPayoutExecution
);

// // Thêm route GET /withdrawals (Admin), POST /payouts/:payoutId/process (Admin) nếu cần
// router.get(
//   '/withdrawals/history', // Lịch sử yêu cầu rút tiền
//   authenticate,
//   authorize([Roles.INSTRUCTOR]),
//   validate(financialsValidation.getMyWithdrawalHistory),
//   financialsController.getMyWithdrawalHistory
// );

// router.get(
//   '/payouts/history', // Lịch sử chi trả
//   authenticate,
//   authorize([Roles.INSTRUCTOR]),
//   validate(financialsValidation.getMyPayoutHistory),
//   financialsController.getMyPayoutHistory
// );

router.get(
  '/payout-activity', // Đổi tên route cho rõ nghĩa "hoạt động"
  authenticate,
  authorize([Roles.INSTRUCTOR]),
  validate(financialsValidation.getWithdrawalActivityHistory),
  financialsController.getWithdrawalActivityHistory
);

// Sửa route này
router.get(
  '/transactions', // Hoặc giữ '/revenue-details' nếu muốn
  authenticate,
  authorize([Roles.INSTRUCTOR]),
  validate(financialsValidation.getMyTransactions), // Validation mới
  financialsController.getMyTransactions // Controller mới
);

router.get(
  '/monthly-earnings',
  authenticate,
  authorize([Roles.INSTRUCTOR]),
  validate(financialsValidation.getMonthlyEarnings),
  financialsController.getMyMonthlyEarnings
);

router.get(
  '/revenue-by-course',
  authenticate,
  authorize([Roles.INSTRUCTOR]),
  validate(financialsValidation.getRevenueByCourse),
  financialsController.getMyRevenueByCourse
);

module.exports = router;
