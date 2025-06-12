// File: src/api/financials/financials.validation.js

const Joi = require('joi');
const Currency = require('../../core/enums/Currency');
const PaymentMethod = require('../../core/enums/PaymentMethod');
const WithdrawalStatus = require('../../core/enums/WithdrawalStatus');
const PayoutStatus = require('../../core/enums/PayoutStatus');

// Yêu cầu rút tiền
const requestWithdrawal = {
  body: Joi.object().keys({
    requestedAmount: Joi.number().positive().required(),
    instructorPayoutMethodId: Joi.number().integer().required(),
    notes: Joi.string().allow(null, ''),
    requestedCurrencyId: Joi.string()
      .required()
      .valid(...Object.values(Currency)),
  }),
};

// Duyệt yêu cầu rút tiền
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

// Lấy danh sách payouts
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

// Xử lý payout
const processPayout = {
  params: Joi.object().keys({
    payoutId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    status: Joi.string()
      .required()
      .valid(PayoutStatus.PAID, PayoutStatus.FAILED),
    actualAmount: Joi.number().min(0).optional().allow(null),
    actualCurrencyId: Joi.string()
      .valid(...Object.values(Currency))
      .optional()
      .allow(null),
    exchangeRate: Joi.number().positive().optional().allow(null),
    fee: Joi.number().min(0).optional().default(0),
    completedAt: Joi.date()
      .iso()
      .optional()
      .default(() => new Date()),
    adminNotes: Joi.string().allow(null, ''),
  }),
};

// Lấy danh sách yêu cầu rút tiền
const getWithdrawalRequests = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
    status: Joi.string().valid(...Object.values(WithdrawalStatus)),
    instructorId: Joi.number().integer(),
    sortBy: Joi.string().pattern(/^[a-zA-Z]+:(asc|desc)$/),
  }),
};

// Lấy giao dịch của tôi
const getMyTransactions = {
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
      .allow(null, ''),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional().min(Joi.ref('startDate')),
  }),
};

// Lịch sử hoạt động rút tiền
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
        'CANCELLED'
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

// Lấy thu nhập theo tháng
const getMonthlyEarnings = {
  query: Joi.object().keys({
    period: Joi.string()
      .regex(/^(last_(6|12)_months|year_\d{4}|all_time)$/)
      .default('last_12_months'),
    courseId: Joi.number().integer().optional(),
  }),
};

// Lấy doanh thu theo khoá học
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
  getWithdrawalRequests,
  getMyTransactions,
  getWithdrawalActivityHistory,
  getMonthlyEarnings,
  getRevenueByCourse,
};
