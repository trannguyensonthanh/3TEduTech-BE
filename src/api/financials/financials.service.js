// File: src/api/financials/financials.service.js
const { isNaN } = require('lodash');
const httpStatus = require('http-status').status;
const { Decimal } = require('decimal.js');
const payoutRepository = require('./payout.repository');
const userRepository = require('../users/users.repository');
const settingRepository = require('../settings/settings.repository');
const settingsService = require('../settings/settings.service');
const ApiError = require('../../core/errors/ApiError');
const WithdrawalStatus = require('../../core/enums/WithdrawalStatus');
const PayoutStatus = require('../../core/enums/PayoutStatus');
const PaymentMethod = require('../../core/enums/PaymentMethod');
const Currency = require('../../core/enums/Currency');
const logger = require('../../utils/logger');
const { getConnection, sql } = require('../../database/connection');
const notificationService = require('../notifications/notifications.service');
const authRepository = require('../auth/auth.repository');
const Roles = require('../../core/enums/Roles');
const balanceTransactionRepository = require('./balanceTransaction.repository');
const payoutMethodRepository = require('../instructors/payoutMethod.repository');
const exchangeRateRepository = require('../exchangeRates/exchangeRates.repository');
const exchangeRateService = require('../exchangeRates/exchangeRates.service');
const { toCamelCaseObject } = require('../../utils/caseConverter');

/**
 * Lấy số dư khả dụng và các tùy chọn rút tiền cho giảng viên.
 * @param {number} instructorId
 * @returns {Promise<AvailableBalanceResponse>}
 */
const getMyAvailableBalance = async (instructorId) => {
  const currentBalanceVND =
    await balanceTransactionRepository.getCurrentBalance(instructorId);
  const balanceDecimal = new Decimal(currentBalanceVND);

  const response = {
    baseBalance: {
      currencyId: 'VND',
      amount: balanceDecimal.toDP(4).toNumber(),
    },
    payoutOptions: [],
  };

  const minWithdrawalVNDStr = await settingsService.getSettingValue(
    'MinWithdrawalAmountVND',
    '250000'
  );
  const minWithdrawalVND = new Decimal(minWithdrawalVNDStr);
  logger.debug('minWithdrawalVND:', minWithdrawalVND.toString());
  response.payoutOptions.push({
    currencyId: 'VND',
    minWithdrawal: minWithdrawalVND.toNumber(),
    maxWithdrawal: balanceDecimal.isNegative() ? 0 : balanceDecimal.toNumber(),
  });

  try {
    const rateRecord = await exchangeRateRepository.findLatestRate(
      'USD',
      'VND'
    );
    if (rateRecord) {
      const usdToVndRate = new Decimal(rateRecord.Rate.toString());

      const minWithdrawalUSDStr = await settingsService.getSettingValue(
        'MinWithdrawalAmountUSD',
        '10'
      );
      const minWithdrawalUSD = new Decimal(minWithdrawalUSDStr);

      const maxWithdrawalUSD = balanceDecimal.isNegative()
        ? new Decimal(0)
        : balanceDecimal.dividedBy(usdToVndRate);

      response.payoutOptions.push({
        currencyId: 'USD',
        minWithdrawal: minWithdrawalUSD.toNumber(),
        maxWithdrawal: maxWithdrawalUSD.toDP(2).toNumber(),
        exchangeRate: usdToVndRate.toDP(4).toNumber(),
        rateSource: rateRecord.Source,
      });
    }
  } catch (error) {
    logger.warn(
      `Could not calculate USD payout option for instructor ${instructorId}: ${error.message}`
    );
  }

  return response;
};

/**
 * Giảng viên tạo yêu cầu rút tiền.
 * @param {number} instructorId
 * @param {object} requestData - { requestedAmount, requestedCurrencyId, instructorPayoutMethodId, notes }
 * @returns {Promise<object>} - WithdrawalRequest vừa tạo.
 */
const requestWithdrawal = async (instructorId, requestData) => {
  const {
    requestedAmount,
    requestedCurrencyId,
    instructorPayoutMethodId,
    notes,
  } = requestData;

  const selectedPayoutMethod =
    await payoutMethodRepository.findPayoutMethodByIdAndAccountId(
      instructorPayoutMethodId,
      instructorId
    );
  if (!selectedPayoutMethod || selectedPayoutMethod.Status !== 'ACTIVE') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Phương thức thanh toán đã chọn không hợp lệ hoặc không hoạt động.'
    );
  }

  const availableBalanceVND =
    await balanceTransactionRepository.getCurrentBalance(instructorId);

  let requestedAmountInBaseCurrency = new Decimal(0);
  const requestedAmountDecimal = new Decimal(requestedAmount);

  if (requestedCurrencyId === 'VND') {
    requestedAmountInBaseCurrency = requestedAmountDecimal;
  } else if (requestedCurrencyId === 'USD') {
    try {
      const rate = await exchangeRateService.getLatestRate('USD', 'VND');
      requestedAmountInBaseCurrency = requestedAmountDecimal.times(rate);
    } catch (error) {
      throw new ApiError(
        httpStatus.SERVICE_UNAVAILABLE,
        'Không thể lấy tỷ giá để xử lý yêu cầu rút USD. Vui lòng thử lại sau.'
      );
    }
  } else {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Loại tiền tệ rút '${requestedCurrencyId}' không được hỗ trợ.`
    );
  }

  const minWithdrawalSettingKey = `MinWithdrawalAmount${requestedCurrencyId}`;
  const minWithdrawalDefault = requestedCurrencyId === 'USD' ? '10' : '250000';
  const minWithdrawalSetting = await settingsService.getSettingValue(
    minWithdrawalSettingKey,
    minWithdrawalDefault
  );
  const minWithdrawalAmount = new Decimal(minWithdrawalSetting);

  if (requestedAmountDecimal.lessThan(minWithdrawalAmount)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Số tiền rút tối thiểu là ${minWithdrawalAmount.toString()} ${requestedCurrencyId}.`
    );
  }

  if (requestedAmountInBaseCurrency.greaterThan(availableBalanceVND)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Số dư khả dụng không đủ. Bạn chỉ có thể rút tối đa tương đương ${new Decimal(availableBalanceVND).toDP(0).toString()} VND.`
    );
  }

  const newRequestData = {
    InstructorID: instructorId,
    RequestedAmount: requestedAmount,
    RequestedCurrencyID: requestedCurrencyId,
    PaymentMethodID: selectedPayoutMethod.MethodID,
    PayoutDetailsSnapshot: selectedPayoutMethod.Details,
    Status: WithdrawalStatus.PENDING,
    InstructorNotes: notes,
  };
  const withdrawalRequest =
    await payoutRepository.createWithdrawalRequest(newRequestData);

  try {
    const instructorProfile =
      await userRepository.findUserProfileById(instructorId);
    const message = `Giảng viên ${instructorProfile?.FullName || instructorId} vừa tạo yêu cầu rút tiền #${withdrawalRequest.RequestID} (${withdrawalRequest.RequestedAmount.toLocaleString()} ${withdrawalRequest.RequestedCurrencyID}).`;
    const adminIds = await authRepository.findAccountIdsByRoles([
      Roles.ADMIN,
      Roles.SUPERADMIN,
    ]);
    if (adminIds && adminIds.length > 0) {
      adminIds.forEach((adminIdObj) => {
        notificationService.createNotification(
          adminIdObj.AccountID,
          'WITHDRAWAL_REQUESTED',
          message,
          { type: 'WithdrawalRequest', id: withdrawalRequest.RequestID }
        );
      });
    }
  } catch (notifyError) {
    logger.error(
      `Failed to send withdrawal requested notification for request ${withdrawalRequest.RequestID}:`,
      notifyError
    );
  }

  return withdrawalRequest;
};

/**
 * Admin duyệt hoặc từ chối yêu cầu rút tiền.
 * Sử dụng InstructorBalanceTransactions để kiểm tra số dư.
 * Khi duyệt, chỉ tạo Payout và cập nhật trạng thái Request.
 * Không còn liên quan đến PaymentSplits.
 * @param {number} requestId
 * @param {string} decision - 'APPROVED' hoặc 'REJECTED'.
 * @param {object} adminUser - Admin thực hiện.
 * @param {string} [adminNotes]
 * @returns {Promise<object>} - WithdrawalRequest đã cập nhật.
 */
const reviewWithdrawalRequest = async (
  requestId,
  decision,
  adminUser,
  adminNotes = null
) => {
  const request = await payoutRepository.findWithdrawalRequestById(requestId);
  if (!request) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Không tìm thấy yêu cầu rút tiền.'
    );
  }
  if (request.Status !== WithdrawalStatus.PENDING) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Yêu cầu này đã được xử lý.');
  }

  let newStatus;
  let notifyType = '';
  let notifyMessage = '';

  if (decision === WithdrawalStatus.APPROVED) {
    newStatus = WithdrawalStatus.PROCESSING;
    notifyType = 'WITHDRAWAL_APPROVED';
    notifyMessage = `Yêu cầu rút tiền #${requestId} của bạn đã được phê duyệt và đang chờ xử lý chi trả.`;
  } else if (decision === WithdrawalStatus.REJECTED) {
    newStatus = WithdrawalStatus.REJECTED;
    notifyType = 'WITHDRAWAL_REJECTED';
    notifyMessage = `Yêu cầu rút tiền #${requestId} của bạn đã bị từ chối.${adminNotes ? ` Lý do: ${adminNotes}` : ''}`;
  } else {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Quyết định không hợp lệ.');
  }

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    let updatedRequest;
    let newPayoutId = null;

    if (newStatus === WithdrawalStatus.PROCESSING) {
      const currentBalance =
        await balanceTransactionRepository.getCurrentBalance(
          request.InstructorID,
          transaction
        );
      if (request.RequestedAmount > currentBalance) {
        await transaction.rollback();

        const rejectUpdateData = {
          Status: WithdrawalStatus.REJECTED,
          AdminID: adminUser.id,
          AdminNotes: `${adminNotes || ''}\n[System]: Số dư khả dụng không đủ tại thời điểm duyệt.`,
          ProcessedAt: new Date(),
        };
        updatedRequest = await payoutRepository.updateWithdrawalRequestStatus(
          requestId,
          rejectUpdateData
        );
        logger.warn(
          `Withdrawal request ${requestId} auto-rejected due to insufficient balance at approval time.`
        );

        notifyType = 'WITHDRAWAL_REJECTED';
        notifyMessage = `Yêu cầu rút tiền #${requestId} của bạn đã bị từ chối. Lý do: Số dư khả dụng không đủ tại thời điểm duyệt.`;
      } else {
        const payoutData = {
          InstructorID: request.InstructorID,
          Amount: request.RequestedAmount,
          CurrencyID: request.RequestedCurrencyID,
          PaymentMethodID: request.PaymentMethodID,
          PayoutDetails: request.PayoutDetailsSnapshot,
          PayoutStatusID: PayoutStatus.PENDING,
          RequestedAt: request.CreatedAt,
          AdminID: adminUser.id,
          AdminNote: adminNotes,
        };
        const newPayout = await payoutRepository.createPayout(
          payoutData,
          transaction
        );
        newPayoutId = newPayout.PayoutID;

        const updateRequestData = {
          Status: newStatus,
          AdminID: adminUser.id,
          AdminNotes: adminNotes,
          ProcessedAt: new Date(),
          PayoutID: newPayoutId,
        };
        updatedRequest = await payoutRepository.updateWithdrawalRequestStatus(
          requestId,
          updateRequestData,
          transaction
        );

        await transaction.commit();
        logger.info(
          `Withdrawal request ${requestId} approved. Payout ${newPayoutId} created and request status set to PROCESSING.`
        );
      }
    } else {
      const updateRequestData = {
        Status: newStatus,
        AdminID: adminUser.id,
        AdminNotes: adminNotes,
        ProcessedAt: new Date(),
        PayoutID: null,
      };
      updatedRequest = await payoutRepository.updateWithdrawalRequestStatus(
        requestId,
        updateRequestData,
        transaction
      );
      await transaction.commit();
      logger.info(
        `Withdrawal request ${requestId} rejected by admin ${adminUser.id}.`
      );
    }

    try {
      if (notifyType && updatedRequest) {
        await notificationService.createNotification(
          updatedRequest.InstructorID,
          notifyType,
          notifyMessage,
          { type: 'WithdrawalRequest', id: requestId }
        );
      }
    } catch (notifyError) {
      logger.error(
        `Failed to send withdrawal review notification for request ${requestId}:`,
        notifyError
      );
    }

    return updatedRequest;
  } catch (error) {
    logger.error(`Error reviewing withdrawal request ${requestId}:`, error);
    if (transaction.rolledBack === false) {
      await transaction.rollback();
    }
    if (
      !(
        error instanceof ApiError &&
        error.statusCode === httpStatus.BAD_REQUEST &&
        error.message.includes('Số dư khả dụng')
      )
    ) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Xử lý yêu cầu rút tiền thất bại.'
      );
    }
    return payoutRepository.findWithdrawalRequestById(requestId);
  }
};

/**
 * Admin lấy danh sách các Payouts (có thể lọc).
 * @param {object} filters - Bộ lọc.
 * @param {object} options - Phân trang, sắp xếp.
 * @returns {Promise<object>} - Dữ liệu payouts và thông tin phân trang.
 */
const getPayouts = async (filters, options) => {
  const { page = 1, limit = 10 } = options;
  const result = await payoutRepository.findAllPayouts(filters, options);
  return {
    payouts: toCamelCaseObject(result.payouts),
    total: result.total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalPages: Math.ceil(result.total / limit),
  };
};

/**
 * Admin xử lý chi trả thực tế cho một Payout.
 * @param {number} payoutId
 * @param {object} executionData - { status ('PAID' or 'FAILED'), actualAmount, actualCurrencyId, exchangeRate, fee, completedAt, adminNotes }
 * @param {object} adminUser - Admin thực hiện.
 * @returns {Promise<object>} - Payout đã cập nhật.
 */
const processPayoutExecution = async (payoutId, executionData, adminUser) => {
  const {
    status,
    actualAmount,
    actualCurrencyId,
    exchangeRate,
    fee,
    completedAt,
    adminNotes,
  } = executionData;

  const payout = await payoutRepository.findPayoutById(payoutId);
  if (!payout) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy yêu cầu chi trả.');
  }
  if (
    ![PayoutStatus.PENDING, PayoutStatus.PROCESSING].includes(
      payout.PayoutStatusID
    )
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Không thể xử lý yêu cầu chi trả ở trạng thái ${payout.PayoutStatusID}.`
    );
  }
  if (![PayoutStatus.PAID, PayoutStatus.FAILED].includes(status)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Trạng thái xử lý không hợp lệ.'
    );
  }

  const payoutUpdateData = {
    PayoutStatusID: status,
    ProcessedAt: payout.ProcessedAt || new Date(),
    CompletedAt: completedAt || new Date(),
    AdminID: adminUser.id,
    AdminNote: adminNotes || payout.AdminNote,
    ...(actualAmount && { ActualAmount: actualAmount }),
    ...(actualCurrencyId && { ActualCurrencyID: actualCurrencyId }),
    ...(exchangeRate && { ExchangeRate: exchangeRate }),
    ...(fee && { Fee: fee }),
  };

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    const updatedPayout = await payoutRepository.updatePayoutExecutionStatus(
      payoutId,
      payoutUpdateData,
      transaction
    );
    if (!updatedPayout)
      throw new Error('Cập nhật trạng thái chi trả thất bại.');

    if (status === PayoutStatus.PAID) {
      const linkedRequest = await transaction
        .request()
        .input('PayoutID', sql.BigInt, payoutId)
        .query(
          'SELECT RequestID FROM WithdrawalRequests WHERE PayoutID = @PayoutID;'
        )
        .then((r) => r.recordset[0]);

      if (linkedRequest) {
        await payoutRepository.updateWithdrawalRequestStatus(
          linkedRequest.RequestID,
          { Status: WithdrawalStatus.COMPLETED },
          transaction
        );
      }

      const amountToDebit = updatedPayout.ActualAmount || updatedPayout.Amount;
      if (amountToDebit > 0) {
        const previousBalance =
          await balanceTransactionRepository.getCurrentBalance(
            updatedPayout.InstructorID,
            transaction
          );
        const newBalance = previousBalance - amountToDebit;

        await balanceTransactionRepository.createBalanceTransaction(
          {
            AccountID: updatedPayout.InstructorID,
            Type: 'DEBIT_WITHDRAWAL',
            Amount: -amountToDebit,
            CurrencyID:
              updatedPayout.ActualCurrencyID || updatedPayout.CurrencyID,
            CurrentBalance: newBalance,
            RelatedEntityType: 'Payout',
            RelatedEntityID: payoutId,
            Description: `Chi trả thành công cho Payout #${payoutId}`,
          },
          transaction
        );
        logger.info(
          `Balance debited for Instructor ${updatedPayout.InstructorID}, Amount: ${-amountToDebit}, New Balance: ${newBalance}`
        );
      } else {
        logger.warn(
          `Payout ${payoutId} has zero amount. No balance transaction created.`
        );
      }
    } else if (status === PayoutStatus.FAILED) {
      const linkedRequest = await transaction
        .request()
        .input('PayoutID', sql.BigInt, payoutId)
        .query(
          'SELECT RequestID FROM WithdrawalRequests WHERE PayoutID = @PayoutID;'
        )
        .then((r) => r.recordset[0]);
      if (linkedRequest) {
        await payoutRepository.updateWithdrawalRequestStatus(
          linkedRequest.RequestID,
          { Status: WithdrawalStatus.PENDING },
          transaction
        );
        logger.info(
          `Withdrawal request ${linkedRequest.RequestID} reverted to PENDING due to failed payout ${payoutId}.`
        );
      }
    }

    await transaction.commit();

    logger.info(
      `Payout ${payoutId} processed by admin ${adminUser.id} with status ${status}.`
    );

    try {
      let notifyMessage = '';
      let notifyType = '';
      const recipientId = updatedPayout.InstructorID;

      if (updatedPayout.PayoutStatusID === PayoutStatus.PAID) {
        notifyMessage = `Khoản thanh toán #${payoutId} (${updatedPayout.Amount} ${updatedPayout.CurrencyID}) đã được xử lý thành công.`;
        notifyType = 'PAYOUT_COMPLETED';
      } else if (updatedPayout.PayoutStatusID === PayoutStatus.FAILED) {
        notifyMessage = `Rất tiếc, khoản thanh toán #${payoutId} (${
          updatedPayout.Amount
        } ${updatedPayout.CurrencyID}) đã xử lý thất bại.${
          adminNotes ? ` Ghi chú: ${adminNotes}` : ''
        }`;
        notifyType = 'PAYOUT_FAILED';
      }

      if (notifyType) {
        await notificationService.createNotification(
          recipientId,
          notifyType,
          notifyMessage,
          { type: 'Payout', id: payoutId }
        );
      }
    } catch (notifyError) {
      logger.error(
        `Failed to send payout execution notification for payout ${payoutId}:`,
        notifyError
      );
    }

    return updatedPayout;
  } catch (error) {
    logger.error(`Error processing payout execution for ${payoutId}:`, error);
    await transaction.rollback();
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Xử lý chi trả thất bại.'
    );
  }
};

/**
 * Lấy lịch sử hoạt động rút tiền tổng hợp của giảng viên.
 * @param {number} instructorId
 * @param {object} options - { page, limit, overallStatus, dateFrom, dateTo, sortBy }
 * @returns {Promise<WithdrawalActivityListResponse>} // Sử dụng interface từ frontend
 */
const getWithdrawalActivityHistory = async (instructorId, options = {}) => {
  const {
    page = 1,
    limit = 10,
    overallStatus,
    dateFrom,
    dateTo,
    sortBy,
  } = options;

  const result = await payoutRepository.findWithdrawalActivities(instructorId, {
    page,
    limit,
    overallStatus,
    dateFrom,
    dateTo,
    sortBy,
  });

  const activities = result.activities.map((item) => {
    let currentPayoutStatus = item.PayoutStatusID;
    if (
      !item.PayoutID &&
      (item.RequestStatus === WithdrawalStatus.REJECTED ||
        item.RequestStatus === WithdrawalStatus.CANCELLED)
    ) {
      currentPayoutStatus = null;
    }

    return {
      requestId: item.RequestID,
      requestedAmount: parseFloat(item.RequestedAmount.toString()),
      requestedCurrencyId: item.RequestedCurrencyID,
      requestStatus: item.RequestStatus,
      requestedAt: item.RequestedAt,
      instructorNotes: item.InstructorNotes,
      adminNotesForRequest: item.AdminNotesForRequest,
      processedAt: item.RequestProcessedAt,

      payoutId: item.PayoutID,
      actualAmountPaid: item.ActualAmountPaid
        ? parseFloat(item.ActualAmountPaid.toString())
        : null,
      payoutCurrencyId: item.ActualPayoutCurrencyID || item.PayoutCurrencyID,
      exchangeRateUsed: item.ExchangeRateUsed
        ? parseFloat(item.ExchangeRateUsed.toString())
        : null,
      transactionFee: item.TransactionFee
        ? parseFloat(item.TransactionFee.toString())
        : null,
      payoutStatus: currentPayoutStatus,
      paymentMethodUsed: item.PaymentMethodUsed,
      payoutDetailsSnapshot: item.PayoutDetailsSnapshot
        ? JSON.parse(item.PayoutDetailsSnapshot)
        : null,
      paymentCompletedAt: item.PaymentCompletedAt,
      adminNotesForPayout: item.AdminNotesForPayout,
    };
  });

  return {
    activities,
    total: result.total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalPages: Math.ceil(result.total / limit),
  };
};

/**
 * Lấy lịch sử giao dịch tổng hợp của giảng viên.
 * @param {number} instructorId
 * @param {object} options - { page, limit, type, startDate, endDate }
 * @returns {Promise<object>} - { transactions, total, page, limit, totalPages }
 */
const getMyTransactions = async (instructorId, options = {}) => {
  const { page = 1, limit = 20, type, startDate, endDate } = options;

  const result = await balanceTransactionRepository.findInstructorTransactions(
    instructorId,
    { page, limit, type, startDate, endDate, includeDetails: true }
  );

  const transactions = result.transactions.map((t) => {
    let detailedDescription = t.TransactionDescription || '';
    if (t.Type === 'CREDIT_SALE' && t.CourseName) {
      detailedDescription = `Doanh thu từ bán khóa học: "${t.CourseName}" (Đơn hàng #${t.OrderID || 'N/A'})`;
      if (t.CustomerEmail)
        detailedDescription += ` - Người mua: ${t.CustomerEmail}`;
    } else if (t.Type === 'DEBIT_WITHDRAWAL' && t.PayoutMethodName) {
      detailedDescription = `Rút tiền thành công qua ${t.PayoutMethodName} (Yêu cầu Payout #${t.RelatedEntityID})`;
    }
    console.log(t);
    return {
      transactionId: t.TransactionID,
      transactionTimestamp: t.TransactionTimestamp,
      type: t.Type,
      amount: parseFloat(t.Amount.toString()),
      currencyId: t.CurrencyID,
      description: detailedDescription,
      relatedEntityType: t.RelatedEntityType,
      relatedEntityId: t.RelatedEntityID,
      sourcePaymentId: t.SourcePaymentID,
      orderItemId: t.Type === 'CREDIT_SALE' ? t.SourceOrderItemID : null,
      courseId: t.Type === 'CREDIT_SALE' ? t.CourseID : null,
      courseName: t.Type === 'CREDIT_SALE' ? t.CourseName : null,
      currentBalanceAfterTransaction: parseFloat(t.CurrentBalance.toString()),
      status: t.PayoutStatusID || t.CoursePaymentStatusID,
    };
  });

  return {
    transactions,
    total: result.total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalPages: Math.ceil(result.total / limit),
  };
};
/**
 * Lấy lịch sử thu nhập theo tháng của giảng viên.
 * @param {number} instructorId
 * @param {object} queryParams - { period, courseId }
 * @returns {Promise<object>} - { earnings: [{month, totalRevenue, netEarnings}], currencyId }
 */
const getMyMonthlyEarnings = async (instructorId, queryParams) => {
  const { period, courseId } = queryParams;
  const options = {
    periodType: period,
    courseId: courseId ? parseInt(courseId, 10) : null,
  };

  try {
    const netEarningsDataPromise =
      balanceTransactionRepository.getMonthlyNetEarnings(instructorId, options);
    const totalRevenueDataPromise =
      balanceTransactionRepository.getMonthlyTotalRevenue(
        instructorId,
        options
      );

    const [netEarningsData, totalRevenueData] = await Promise.all([
      netEarningsDataPromise,
      totalRevenueDataPromise,
    ]);

    const revenueMap = new Map();
    totalRevenueData.forEach((item) => {
      revenueMap.set(item.month, item.totalRevenue);
    });

    const combinedEarnings = netEarningsData.map((netItem) => {
      const totalRevenue = revenueMap.get(netItem.month) || 0;
      return {
        month: netItem.month,
        totalRevenue,
        netEarnings: netItem.netEarnings,
      };
    });

    revenueMap.forEach((totalRevenue, month) => {
      if (!combinedEarnings.some((e) => e.month === month)) {
        combinedEarnings.push({ month, totalRevenue, netEarnings: 0 });
      }
    });

    combinedEarnings.sort((a, b) => a.month.localeCompare(b.month));

    return {
      earnings: combinedEarnings,
      currencyId: Currency.VND,
    };
  } catch (error) {
    logger.error(
      `Error fetching monthly earnings for instructor ${instructorId}:`,
      error
    );
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Không thể tải dữ liệu thu nhập hàng tháng.'
    );
  }
};

/**
 * Lấy phân tích doanh thu theo khóa học của giảng viên.
 * @param {number} instructorId
 * @param {object} queryParams - { period }
 * @returns {Promise<object>} - { courses: [{courseId, courseName, totalSalesCount, totalRevenue, netEarnings, percentageOfTotalEarnings}], currencyId }
 */
const getMyRevenueByCourse = async (instructorId, queryParams) => {
  const { period } = queryParams;
  const options = { periodType: period };

  try {
    const courseRevenues =
      await balanceTransactionRepository.getRevenueByCourse(
        instructorId,
        options
      );

    const totalNetEarningsInPeriod = courseRevenues.reduce(
      (sum, course) => sum + course.netEarnings,
      0
    );

    const coursesWithPercentage = courseRevenues.map((course) => ({
      ...course,
      percentageOfTotalEarnings:
        totalNetEarningsInPeriod > 0
          ? parseFloat(
              ((course.netEarnings / totalNetEarningsInPeriod) * 100).toFixed(2)
            )
          : 0,
    }));

    return {
      courses: coursesWithPercentage,
      currencyId: Currency.VND,
      totalCourses: coursesWithPercentage.length,
    };
  } catch (error) {
    logger.error(
      `Error fetching revenue by course for instructor ${instructorId}:`,
      error
    );
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Không thể tải dữ liệu doanh thu theo khóa học.'
    );
  }
};

/**
 * Lấy danh sách yêu cầu rút tiền cho Admin.
 * @param {object} filters - { status, instructorId }
 * @param {object} options - { page, limit, sortBy }
 * @returns {Promise<object>}
 */
const getWithdrawalRequestsForAdmin = async (filters, options) => {
  const { page = 1, limit = 10 } = options;
  const result = await payoutRepository.findWithdrawalRequests(
    filters,
    options
  );
  const formattedRequests = toCamelCaseObject(result.requests);
  return {
    requests: formattedRequests,
    total: result.total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalPages: Math.ceil(result.total / limit),
  };
};

module.exports = {
  getMyAvailableBalance,
  requestWithdrawal,
  reviewWithdrawalRequest,
  getPayouts,
  processPayoutExecution,
  getWithdrawalRequestsForAdmin,
  getMyTransactions,
  getWithdrawalActivityHistory,
  getMyMonthlyEarnings,
  getMyRevenueByCourse,
};
