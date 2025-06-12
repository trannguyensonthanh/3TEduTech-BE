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
router.get(
  '/balance',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.SUPERADMIN]),
  financialsController.getMyAvailableBalance
);

router.post(
  '/withdrawals/request',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.SUPERADMIN]),
  validate(financialsValidation.requestWithdrawal),
  financialsController.requestWithdrawal
);

// --- Admin Routes ---
router.patch(
  '/withdrawals/:requestId/review',
  authenticate,
  authorize([Roles.ADMIN, Roles.SUPERADMIN]),
  validate(financialsValidation.reviewWithdrawal),
  financialsController.reviewWithdrawalRequest
);

// --- Thêm Admin Routes cho Payout Management ---
router.get(
  '/payouts',
  authenticate,
  authorize([Roles.ADMIN, Roles.SUPERADMIN]),
  validate(financialsValidation.getPayouts),
  financialsController.getPayouts
);

router.patch(
  '/payouts/:payoutId/process',
  authenticate,
  authorize([Roles.ADMIN, Roles.SUPERADMIN]),
  validate(financialsValidation.processPayout),
  financialsController.processPayoutExecution
);

router.get(
  '/withdrawal-requests',
  validate(financialsValidation.getWithdrawalRequests),
  financialsController.getWithdrawalRequests
);

router.get(
  '/payout-activity',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.SUPERADMIN]),
  validate(financialsValidation.getWithdrawalActivityHistory),
  financialsController.getWithdrawalActivityHistory
);

router.get(
  '/transactions',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.SUPERADMIN]),
  validate(financialsValidation.getMyTransactions),
  financialsController.getMyTransactions
);

router.get(
  '/monthly-earnings',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.SUPERADMIN]),
  validate(financialsValidation.getMonthlyEarnings),
  financialsController.getMyMonthlyEarnings
);

router.get(
  '/revenue-by-course',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.SUPERADMIN]),
  validate(financialsValidation.getRevenueByCourse),
  financialsController.getMyRevenueByCourse
);

module.exports = router;
