// File: src/api/financials/financials.validation.js

const Joi = require('joi');
const Currency = require('../../core/enums/Currency');
const PaymentMethod = require('../../core/enums/PaymentMethod');
const WithdrawalStatus = require('../../core/enums/WithdrawalStatus');
const PayoutStatus = require('../../core/enums/PayoutStatus');

// const requestWithdrawal = {
//   body: Joi.object().keys({
//     requestedAmount: Joi.number().positive().required(),
//     requestedCurrencyId: Joi.string().required().valid(Currency.VND), // Chỉ cho VND
//     paymentMethodId: Joi.string().required().valid(PaymentMethod.BANK_TRANSFER), // Chỉ cho Bank
//     instructorNotes: Joi.string().allow(null, ''),
//   }),
// };

const requestWithdrawal = {
  body: Joi.object().keys({
    amount: Joi.number().positive().required(), // Đổi tên từ requestedAmount
    instructorPayoutMethodId: Joi.number().integer().required(), // ID của InstructorPayoutMethods
    notes: Joi.string().allow(null, ''), // Đổi tên từ instructorNotes
  }),
};

const reviewWithdrawal = {
  params: Joi.object().keys({
    requestId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    decision: Joi.string()
      .required()
      .valid(WithdrawalStatus.APPROVED, WithdrawalStatus.REJECTED),
    adminNotes: Joi.string().allow(null, ''),
  }),
};

const getPayouts = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
    sortBy: Joi.string().pattern(/^[a-zA-Z]+:(asc|desc)$/),
    instructorId: Joi.number().integer(),
    statusId: Joi.string().valid(...Object.values(PayoutStatus)),
    paymentMethodId: Joi.string().valid(...Object.values(PaymentMethod)),
  }),
};

const processPayout = {
  params: Joi.object().keys({
    payoutId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    status: Joi.string()
      .required()
      .valid(PayoutStatus.PAID, PayoutStatus.FAILED),
    actualAmount: Joi.number().min(0).optional().allow(null), // Số tiền thực chuyển
    actualCurrencyId: Joi.string()
      .valid(...Object.values(Currency))
      .optional()
      .allow(null), // Tiền tệ thực chuyển
    exchangeRate: Joi.number().positive().optional().allow(null), // Tỷ giá nếu có chuyển đổi
    fee: Joi.number().min(0).optional().default(0), // Phí giao dịch
    completedAt: Joi.date()
      .iso()
      .optional()
      .default(() => new Date()), // Thời điểm hoàn thành
    adminNotes: Joi.string().allow(null, ''), // Ghi chú thêm của admin
  }),
};
// // Thêm validation cho các API khác nếu cần (get history, process payout...)
// const getMyWithdrawalHistory = {
//   query: Joi.object().keys({
//     page: Joi.number().integer().min(1),
//     limit: Joi.number().integer().min(1).max(50),
//     status: Joi.string()
//       .valid(...Object.values(WithdrawalStatus))
//       .allow(null, ''),
//   }),
// };

// const getMyPayoutHistory = {
//   query: Joi.object().keys({
//     page: Joi.number().integer().min(1),
//     limit: Joi.number().integer().min(1).max(50),
//     statusId: Joi.string()
//       .valid(...Object.values(PayoutStatus))
//       .allow(null, ''),
//   }),
// };

const getMyTransactions = {
  // Đổi tên từ getMyRevenueDetails
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
    type: Joi.string()
      .valid(
        'ALL',
        'CREDIT_SALE',
        'DEBIT_WITHDRAWAL',
        'CREDIT_REFUND',
        'DEBIT_FEE',
        'ADJUSTMENT_ADD',
        'ADJUSTMENT_SUB'
      )
      .allow(null, ''), // Cho phép lọc theo Type
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional().min(Joi.ref('startDate')), // endDate phải sau startDate
  }),
};

const getWithdrawalActivityHistory = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(50),
    overallStatus: Joi.string()
      .valid(
        'PENDING',
        'PROCESSING',
        'COMPLETED',
        'FAILED',
        'REJECTED',
        'CANCELLED' // Các trạng thái chung
      )
      .optional()
      .allow(null, ''),
    dateFrom: Joi.date().iso().optional(),
    dateTo: Joi.date().iso().optional().min(Joi.ref('dateFrom')),
    sortBy: Joi.string()
      .pattern(/^[a-zA-Z]+:(asc|desc)$/)
      .optional()
      .valid(
        'requestedAt:desc',
        'requestedAt:asc',
        'paymentCompletedAt:desc',
        'paymentCompletedAt:asc'
      ),
  }),
};

const getMonthlyEarnings = {
  query: Joi.object().keys({
    period: Joi.string()
      .regex(/^(last_(6|12)_months|year_\d{4}|all_time)$/)
      .default('last_12_months'),
    courseId: Joi.number().integer().optional(),
  }),
};

const getRevenueByCourse = {
  query: Joi.object().keys({
    period: Joi.string()
      .regex(/^(last_(6|12)_months|year_\d{4}|all_time)$/)
      .default('last_12_months'),
  }),
};

module.exports = {
  requestWithdrawal,
  reviewWithdrawal,
  getPayouts,
  processPayout,
  // getMyWithdrawalHistory,
  // getMyPayoutHistory,
  getMyTransactions,
  getWithdrawalActivityHistory,
  getMonthlyEarnings,
  getRevenueByCourse,
};
