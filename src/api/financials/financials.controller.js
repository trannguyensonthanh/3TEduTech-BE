// File: src/api/financials/financials.controller.js

const httpStatus = require('http-status').status;
const financialsService = require('./financials.service');
const { catchAsync } = require('../../utils/catchAsync');
const { pick } = require('../../utils/pick');

// --- Instructor Controllers ---
const getMyAvailableBalance = catchAsync(async (req, res) => {
  const balanceInfo = await financialsService.getMyAvailableBalance(
    req.user.id
  );
  res.status(httpStatus.OK).send(balanceInfo);
});

const requestWithdrawal = catchAsync(async (req, res) => {
  const request = await financialsService.requestWithdrawal(
    req.user.id,
    req.body
  );
  res.status(httpStatus.CREATED).send(request);
});

const getWithdrawalRequests = catchAsync(async (req, res) => {
  const filters = pick(req.query, ['status', 'instructorId']);
  const options = pick(req.query, ['page', 'limit', 'sortBy']);
  const result = await financialsService.getWithdrawalRequestsForAdmin(
    filters,
    options
  );
  res.status(httpStatus.OK).send(result);
});

const getMyTransactions = catchAsync(async (req, res) => {
  const options = pick(req.query, [
    'limit',
    'page',
    'type',
    'startDate',
    'endDate',
  ]);
  const result = await financialsService.getMyTransactions(
    req.user.id,
    options
  );
  res.status(httpStatus.OK).send(result);
});

// --- Admin Controllers ---
const reviewWithdrawalRequest = catchAsync(async (req, res) => {
  const { decision, adminNotes } = req.body;
  const updatedRequest = await financialsService.reviewWithdrawalRequest(
    req.params.requestId,
    decision,
    req.user,
    adminNotes
  );
  res.status(httpStatus.OK).send(updatedRequest);
});

// --- Thêm Admin Controllers ---
const getPayouts = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'instructorId',
    'statusId',
    'paymentMethodId',
  ]);
  const options = pick(req.query, ['limit', 'page', 'sortBy']);
  const result = await financialsService.getPayouts(filters, options);
  res.status(httpStatus.OK).send(result);
});

const processPayoutExecution = catchAsync(async (req, res) => {
  const payout = await financialsService.processPayoutExecution(
    req.params.payoutId,
    req.body,
    req.user
  );
  res.status(httpStatus.OK).send(payout);
});

const getWithdrawalActivityHistory = catchAsync(async (req, res) => {
  const options = pick(req.query, [
    'limit',
    'page',
    'overallStatus',
    'dateFrom',
    'dateTo',
    'sortBy',
  ]);
  const result = await financialsService.getWithdrawalActivityHistory(
    req.user.id,
    options
  );
  res.status(httpStatus.OK).send(result);
});

const getMyMonthlyEarnings = catchAsync(async (req, res) => {
  const queryParams = pick(req.query, ['period', 'courseId']);
  const earnings = await financialsService.getMyMonthlyEarnings(
    req.user.id,
    queryParams
  );
  res.status(httpStatus.OK).send(earnings);
});

const getMyRevenueByCourse = catchAsync(async (req, res) => {
  const queryParams = pick(req.query, ['period']);
  const result = await financialsService.getMyRevenueByCourse(
    req.user.id,
    queryParams
  );
  res.status(httpStatus.OK).send(result);
});

module.exports = {
  // Instructor
  getMyAvailableBalance,
  requestWithdrawal,
  getWithdrawalRequests,
  getMyTransactions,
  // Admin
  reviewWithdrawalRequest,
  getPayouts,
  processPayoutExecution,
  getWithdrawalActivityHistory,
  getMyMonthlyEarnings,
  getMyRevenueByCourse,
};
