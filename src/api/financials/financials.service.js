// File: src/api/financials/financials.service.js
const { isNaN } = require('lodash');
const httpStatus = require('http-status').status;

const payoutRepository = require('./payout.repository');
const userRepository = require('../users/users.repository'); // Lấy profile instructor
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

/**
 * Lấy số dư khả dụng của giảng viên hiện tại.
 * @param {number} instructorId
 * @returns {Promise<number>}
 */
const getMyAvailableBalance = async (instructorId) => {
  return balanceTransactionRepository.getCurrentBalance(instructorId);
};

// /**
//  * Giảng viên tạo yêu cầu rút tiền.
//  * @param {number} instructorId
//  * @param {object} requestData - { requestedAmount, requestedCurrencyId, paymentMethodId (BANK_TRANSFER), instructorNotes }
//  * @returns {Promise<object>} - WithdrawalRequest vừa tạo.
//  */
// const requestWithdrawal = async (instructorId, requestData) => {
//   const {
//     requestedAmount,
//     requestedCurrencyId,
//     paymentMethodId,
//     instructorNotes,
//   } = requestData;

//   // 1. Kiểm tra phương thức thanh toán hợp lệ (vd: chỉ cho BANK_TRANSFER)
//   if (paymentMethodId !== PaymentMethod.BANK_TRANSFER) {
//     throw new ApiError(
//       httpStatus.BAD_REQUEST,
//       'Phương thức rút tiền không được hỗ trợ.'
//     );
//   }
//   // Kiểm tra currency hợp lệ (vd: chỉ cho VND)
//   if (requestedCurrencyId !== Currency.VND) {
//     throw new ApiError(
//       httpStatus.BAD_REQUEST,
//       'Loại tiền tệ rút không được hỗ trợ.'
//     );
//   }

//   // 2. *** Lấy thông tin phương thức thanh toán đã chọn từ InstructorPayoutMethods ***
//   const payoutMethod = await payoutMethodRepository.findSpecificPayoutMethod(
//     instructorId,
//     paymentMethodId
//   );
//   if (!payoutMethod || payoutMethod.Status !== 'ACTIVE') {
//     throw new ApiError(
//       httpStatus.BAD_REQUEST,
//       `Phương thức thanh toán ${paymentMethodId} không hợp lệ hoặc chưa được kích hoạt.`
//     );
//   }
//   // Lấy chi tiết JSON từ payoutMethod.Details
//   const payoutDetailsSnapshot = payoutMethod.Details;

//   // 3. Lấy số dư khả dụng và kiểm tra
//   const availableBalance =
//     await balanceTransactionRepository.getCurrentBalance(instructorId);
//   const minWithdrawalSetting = await settingRepository.findSettingByKey(
//     `MinWithdrawalAmount${requestedCurrencyId}`
//   );
//   const minWithdrawalAmount = parseFloat(
//     minWithdrawalSetting?.SettingValue || '0'
//   );

//   if (requestedAmount <= 0) {
//     throw new ApiError(
//       httpStatus.BAD_REQUEST,
//       'Số tiền yêu cầu rút phải lớn hơn 0.'
//     );
//   }
//   if (requestedAmount < minWithdrawalAmount) {
//     throw new ApiError(
//       httpStatus.BAD_REQUEST,
//       `Số tiền rút tối thiểu là ${minWithdrawalAmount} ${requestedCurrencyId}.`
//     );
//   }
//   if (requestedAmount > availableBalance) {
//     throw new ApiError(
//       httpStatus.BAD_REQUEST,
//       `Số dư khả dụng không đủ (${availableBalance} ${requestedCurrencyId}).`
//     );
//   }

//   // 4. Tạo yêu cầu rút tiền
//   const newRequestData = {
//     InstructorID: instructorId,
//     RequestedAmount: requestedAmount,
//     RequestedCurrencyID: requestedCurrencyId,
//     PaymentMethodID: paymentMethodId,
//     PayoutDetailsSnapshot: payoutDetailsSnapshot,
//     Status: WithdrawalStatus.PENDING,
//     InstructorNotes: instructorNotes,
//   };
//   const withdrawalRequest =
//     await payoutRepository.createWithdrawalRequest(newRequestData);

//   // TODO: Gửi thông báo cho Admin
//   try {
//     const instructorProfile =
//       await userRepository.findUserProfileById(instructorId); // Lấy tên instructor
//     const message = `Giảng viên ${
//       instructorProfile?.FullName || instructorId
//     } vừa tạo yêu cầu rút tiền #${withdrawalRequest.RequestID}.`;
//     const adminIds = await authRepository.findAccountIdsByRoles([
//       Roles.ADMIN,
//       Roles.SUPERADMIN,
//     ]);
//     if (adminIds && adminIds.length > 0) {
//       adminIds.forEach((adminIdObj) => {
//         // Giả sử hàm trả về mảng object { AccountID }
//         notificationService.createNotification(
//           adminIdObj.AccountID,
//           'WITHDRAWAL_REQUESTED',
//           message,
//           { type: 'WithdrawalRequest', id: withdrawalRequest.RequestID }
//         );
//       });
//     } else {
//       logger.warn(
//         'No Admins/SuperAdmins found to notify about new withdrawal request.'
//       );
//     }
//   } catch (notifyError) {
//     logger.error(
//       `Failed to send withdrawal requested notification for request ${withdrawalRequest.RequestID}:`,
//       notifyError
//     );
//   }
//   return withdrawalRequest;
// };

/**
 * Giảng viên tạo yêu cầu rút tiền.
 * @param {number} instructorId
 * @param {object} requestData - { amount, instructorPayoutMethodId, notes }
 * @returns {Promise<object>} - WithdrawalRequest vừa tạo.
 */
const requestWithdrawal = async (instructorId, requestData) => {
  const { amount, instructorPayoutMethodId, notes } = requestData;

  // 1. Lấy chi tiết phương thức thanh toán mà instructor đã chọn
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

  // 2. Xác định CurrencyID (ví dụ: luôn là VND cho thị trường VN)
  // Hoặc có thể lấy từ selectedPayoutMethod nếu bảng đó có lưu CurrencyID cho từng phương thức
  const requestedCurrencyId = Currency.VND; // Mặc định

  // 3. Lấy thông tin tài khoản ngân hàng/paypal từ selectedPayoutMethod.Details
  // PayoutDetailsSnapshot sẽ là JSON string của selectedPayoutMethod.Details
  const payoutDetailsSnapshot = selectedPayoutMethod.Details; // Đây đã là JSON string từ DB

  // 4. Lấy số dư khả dụng và kiểm tra
  const availableBalance =
    await balanceTransactionRepository.getCurrentBalance(instructorId);
  const minWithdrawalSettingKey = `MinWithdrawalAmount${requestedCurrencyId}`; // vd: MinWithdrawalAmountVND
  const minWithdrawalSetting = await settingsService.getSettingValue(
    minWithdrawalSettingKey,
    '0'
  ); // Dùng settingsService
  const minWithdrawalAmount = parseFloat(minWithdrawalSetting);

  if (isNaN(minWithdrawalAmount)) {
    logger.error(
      `Invalid MinWithdrawalAmount setting for ${requestedCurrencyId}. Key: ${minWithdrawalSettingKey}`
    );
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Lỗi cấu hình số tiền rút tối thiểu.'
    );
  }

  if (amount <= 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Số tiền yêu cầu rút phải lớn hơn 0.'
    );
  }
  if (amount < minWithdrawalAmount) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Số tiền rút tối thiểu là ${minWithdrawalAmount.toLocaleString()} ${requestedCurrencyId}.`
    );
  }
  if (amount > availableBalance) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Số dư khả dụng không đủ (${availableBalance.toLocaleString()} ${requestedCurrencyId}).`
    );
  }

  // 5. Tạo yêu cầu rút tiền
  const newRequestData = {
    InstructorID: instructorId,
    RequestedAmount: amount,
    RequestedCurrencyID: requestedCurrencyId,
    PaymentMethodID: selectedPayoutMethod.MethodID, // Lấy MethodID (BANK_TRANSFER, PAYPAL) từ PayoutMethod đã chọn
    PayoutDetailsSnapshot: payoutDetailsSnapshot, // Lưu JSON string chi tiết của phương thức
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
  // Chỉ xử lý yêu cầu đang chờ
  if (request.Status !== WithdrawalStatus.PENDING) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Yêu cầu này đã được xử lý.');
  }

  let newStatus;
  let notifyType = '';
  let notifyMessage = '';

  if (decision === WithdrawalStatus.APPROVED) {
    newStatus = WithdrawalStatus.PROCESSING; // Chuyển sang Processing chờ chi trả
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
      // Chỉ xử lý thêm khi APPROVED
      // 1. KIỂM TRA LẠI SỐ DƯ tại thời điểm duyệt
      const currentBalance =
        await balanceTransactionRepository.getCurrentBalance(
          request.InstructorID,
          transaction
        );
      if (request.RequestedAmount > currentBalance) {
        // Nếu không đủ tiền, tự động Reject và rollback
        await transaction.rollback(); // Hủy transaction hiện tại

        // Cập nhật request thành REJECTED (ngoài transaction)
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

        // Cập nhật lại thông báo
        notifyType = 'WITHDRAWAL_REJECTED';
        notifyMessage = `Yêu cầu rút tiền #${requestId} của bạn đã bị từ chối. Lý do: Số dư khả dụng không đủ tại thời điểm duyệt.`;
        // --> Đi thẳng xuống phần gửi thông báo bên ngoài try...catch
      } else {
        // 2. TẠO BẢN GHI PAYOUT (Status PENDING)
        const payoutData = {
          InstructorID: request.InstructorID,
          Amount: request.RequestedAmount, // Số tiền bằng số tiền yêu cầu
          CurrencyID: request.RequestedCurrencyID,
          PaymentMethodID: request.PaymentMethodID,
          PayoutDetails: request.PayoutDetailsSnapshot,
          PayoutStatusID: PayoutStatus.PENDING, // Chờ admin thực hiện chi trả
          RequestedAt: request.CreatedAt, // Lấy thời gian từ request gốc
          AdminID: adminUser.id,
          AdminNote: adminNotes,
        };
        const newPayout = await payoutRepository.createPayout(
          payoutData,
          transaction
        );
        newPayoutId = newPayout.PayoutID; // Lưu lại ID để liên kết

        // 3. CẬP NHẬT WITHDRAWAL REQUEST
        const updateRequestData = {
          Status: newStatus, // PROCESSING
          AdminID: adminUser.id,
          AdminNotes: adminNotes,
          ProcessedAt: new Date(),
          PayoutID: newPayoutId, // Liên kết với Payout vừa tạo
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
      // Trường hợp REJECTED
      // Chỉ cập nhật Withdrawal Request status
      const updateRequestData = {
        Status: newStatus, // REJECTED
        AdminID: adminUser.id,
        AdminNotes: adminNotes,
        ProcessedAt: new Date(),
        PayoutID: null, // Đảm bảo PayoutID là null
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

    // Gửi thông báo (sau khi transaction thành công hoặc reject xong)
    try {
      if (notifyType && updatedRequest) {
        // Chỉ gửi nếu có type và request đã được cập nhật
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

    return updatedRequest; // Trả về request đã cập nhật
  } catch (error) {
    logger.error(`Error reviewing withdrawal request ${requestId}:`, error);
    // Rollback nếu transaction chưa được commit (ví dụ lỗi khi tạo Payout)
    if (transaction.rolledBack === false) {
      // Kiểm tra trạng thái trước khi rollback lại
      await transaction.rollback();
    }
    // Ném lỗi nếu không phải là lỗi số dư đã xử lý
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
    // Nếu là lỗi số dư đã xử lý thì trả về updatedRequest (đã bị reject)
    return payoutRepository.findWithdrawalRequestById(requestId);
  }
};

// const reviewWithdrawalRequest = async (
//   requestId,
//   decision,
//   adminUser,
//   adminNotes = null
// ) => {
//   // ... (lấy request, kiểm tra status)

//   let updatedRequest; // Biến để lưu kết quả cuối cùng

//   if (decision === WithdrawalStatus.APPROVED) {
//       // ... (logic xử lý duyệt, tạo Payout, link Split trong transaction)
//       // *** Sau khi commit transaction thành công ***
//       updatedRequest = await payoutRepository.findWithdrawalRequestById(requestId); // Lấy lại request đã update
//       logger.info(`Withdrawal request ${requestId} approved. Payout ${updatedRequest.PayoutID} created.`);

//       // *** Gửi thông báo cho Instructor ***
//       try {
//           const recipientId = updatedRequest.InstructorID;
//           const message = `Yêu cầu rút tiền #${requestId} của bạn đã được phê duyệt và đang chờ xử lý chi trả.`;
//           await notificationService.createNotification(
//               recipientId,
//               'WITHDRAWAL_APPROVED',
//               message,
//               { type: 'WithdrawalRequest', id: requestId }
//           );
//       } catch(notifyError) {
//           logger.error(`Failed to send withdrawal approved notification for request ${requestId}:`, notifyError);
//       }
//       // *** Kết thúc phần gửi thông báo ***

//   } else if (decision === WithdrawalStatus.REJECTED) {
//       // ... (logic cập nhật status thành REJECTED)
//       updatedRequest = await payoutRepository.updateWithdrawalRequestStatus(requestId, updateData);
//       logger.info(`Withdrawal request ${requestId} rejected by admin ${adminUser.id}.`);

//       // *** Gửi thông báo cho Instructor ***
//        try {
//           const recipientId = updatedRequest.InstructorID;
//           const message = `Yêu cầu rút tiền #${requestId} của bạn đã bị từ chối.${adminNotes ? ` Lý do: ${adminNotes}` : ''}`;
//           await notificationService.createNotification(
//               recipientId,
//               'WITHDRAWAL_REJECTED',
//               message,
//               { type: 'WithdrawalRequest', id: requestId }
//           );
//       } catch(notifyError) {
//           logger.error(`Failed to send withdrawal rejected notification for request ${requestId}:`, notifyError);
//       }
//       // *** Kết thúc phần gửi thông báo ***

//   } else {
//       throw new ApiError(httpStatus.BAD_REQUEST, "Quyết định không hợp lệ.");
//   }

//   return updatedRequest; // Trả về request đã cập nhật
// };

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
    payouts: result.payouts,
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

  // 1. Lấy thông tin Payout
  const payout = await payoutRepository.findPayoutById(payoutId);
  if (!payout) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy yêu cầu chi trả.');
  }
  // Chỉ xử lý các Payout đang chờ (PENDING) hoặc đang xử lý (PROCESSING)
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
  // Validate status mới
  if (![PayoutStatus.PAID, PayoutStatus.FAILED].includes(status)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Trạng thái xử lý không hợp lệ.'
    );
  }

  // 2. Chuẩn bị dữ liệu cập nhật cho Payouts
  const payoutUpdateData = {
    PayoutStatusID: status,
    ProcessedAt: payout.ProcessedAt || new Date(), // Ghi nhận thời điểm bắt đầu xử lý nếu chưa có
    CompletedAt: completedAt || new Date(), // Thời điểm hoàn thành/thất bại
    AdminID: adminUser.id, // Ghi nhận admin xử lý lần cuối
    AdminNote: adminNotes || payout.AdminNote, // Có thể ghi đè note cũ
    ...(actualAmount && { ActualAmount: actualAmount }),
    ...(actualCurrencyId && { ActualCurrencyID: actualCurrencyId }),
    ...(exchangeRate && { ExchangeRate: exchangeRate }),
    ...(fee && { Fee: fee }),
  };

  // Bắt đầu transaction (nếu cần cập nhật nhiều bảng)
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // 3. Cập nhật bản ghi Payouts
    const updatedPayout = await payoutRepository.updatePayoutExecutionStatus(
      payoutId,
      payoutUpdateData,
      transaction // Truyền transaction
    );
    if (!updatedPayout)
      throw new Error('Cập nhật trạng thái chi trả thất bại.');

    // 4. Nếu thành công (PAID), cập nhật WithdrawalRequest và tạo Balance Transaction
    if (status === PayoutStatus.PAID) {
      // Cập nhật WithdrawalRequest liên quan thành COMPLETED
      const linkedRequest = await transaction
        .request() // Tìm request liên kết với payout này
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

      // *** Tạo giao dịch trừ tiền trong InstructorBalanceTransactions ***
      const amountToDebit = updatedPayout.ActualAmount || updatedPayout.Amount; // Lấy số tiền thực trả nếu có, nếu không lấy số tiền payout
      if (amountToDebit > 0) {
        const previousBalance =
          await balanceTransactionRepository.getCurrentBalance(
            updatedPayout.InstructorID,
            transaction
          );
        const newBalance = previousBalance - amountToDebit; // Trừ tiền

        await balanceTransactionRepository.createBalanceTransaction(
          {
            AccountID: updatedPayout.InstructorID,
            Type: 'DEBIT_WITHDRAWAL',
            Amount: -amountToDebit, // Số tiền âm
            CurrencyID:
              updatedPayout.ActualCurrencyID || updatedPayout.CurrencyID, // Ưu tiên currency thực trả
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
      // Xử lý khi chi trả thất bại:
      // - WithdrawalRequest có thể quay lại PENDING hoặc giữ nguyên PROCESSING? -> Nên quay lại PENDING để admin xử lý lại.
      // - Có cần tạo giao dịch hoàn tiền vào balance không? Không, vì tiền chưa thực sự bị trừ khi yêu cầu.
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
          { Status: WithdrawalStatus.PENDING }, // Quay lại PENDING
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
    // TODO: Gửi thông báo chi trả thành công/thất bại cho Giảng viên

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

    return updatedPayout; // Trả về payout đã cập nhật
  } catch (error) {
    logger.error(`Error processing payout execution for ${payoutId}:`, error);
    await transaction.rollback();
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Xử lý chi trả thất bại.'
    );
  }
};
// Thêm các hàm khác: lấy lịch sử rút tiền, admin thực hiện chi trả, ...
// /**
//  * Lấy lịch sử yêu cầu rút tiền của giảng viên.
//  * @param {number} instructorId
//  * @param {object} options - { page, limit, status }
//  * @returns {Promise<object>}
//  */
// const getMyWithdrawalHistory = async (instructorId, options) => {
//   const { page = 1, limit = 10, status } = options;
//   const result = await payoutRepository.findWithdrawalRequestsByInstructor(
//     instructorId,
//     { page, limit, status }
//   );
//   return {
//     requests: result.requests,
//     total: result.total,
//     page: parseInt(page, 10),
//     limit: parseInt(limit, 10),
//     totalPages: Math.ceil(result.total / limit),
//   };
// };

// /**
//  * Lấy lịch sử chi trả (Payouts) của giảng viên.
//  * @param {number} instructorId
//  * @param {object} options - { page, limit, statusId }
//  * @returns {Promise<object>}
//  */
// const getMyPayoutHistory = async (instructorId, options) => {
//   const { page = 1, limit = 10, statusId } = options;
//   const result = await payoutRepository.findPayoutsByInstructor(instructorId, {
//     page,
//     limit,
//     statusId,
//   });
//   return {
//     payouts: result.payouts,
//     total: result.total,
//     page: parseInt(page, 10),
//     limit: parseInt(limit, 10),
//     totalPages: Math.ceil(result.total / limit),
//   };
// };

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

  // Map dữ liệu từ repo sang cấu trúc WithdrawalActivityItem của frontend
  const activities = result.activities.map((item) => {
    let currentPayoutStatus = item.PayoutStatusID;
    // Nếu Request là REJECTED hoặc CANCELLED, và chưa có Payout, thì PayoutStatus không áp dụng
    if (
      !item.PayoutID &&
      (item.RequestStatus === WithdrawalStatus.REJECTED ||
        item.RequestStatus === WithdrawalStatus.CANCELLED)
    ) {
      currentPayoutStatus = null; // Hoặc một giá trị đặc biệt
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
      payoutCurrencyId: item.ActualPayoutCurrencyID || item.PayoutCurrencyID, // Ưu tiên actual
      exchangeRateUsed: item.ExchangeRateUsed
        ? parseFloat(item.ExchangeRateUsed.toString())
        : null,
      transactionFee: item.TransactionFee
        ? parseFloat(item.TransactionFee.toString())
        : null,
      payoutStatus: currentPayoutStatus, // Đã xử lý ở trên
      paymentMethodUsed: item.PaymentMethodUsed,
      payoutDetailsSnapshot: item.PayoutDetailsSnapshot
        ? JSON.parse(item.PayoutDetailsSnapshot)
        : null, // Parse JSON
      paymentCompletedAt: item.PaymentCompletedAt,
      // externalTransactionId: item.ExternalTransactionID, // Cần thêm vào Payouts nếu có
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
    { page, limit, type, startDate, endDate, includeDetails: true } // includeDetails: true để lấy thông tin join
  );

  // Map kết quả từ repo sang cấu trúc InstructorTransactionItem mong muốn của frontend
  const transactions = result.transactions.map((t) => {
    let detailedDescription = t.TransactionDescription || ''; // Mô tả gốc
    if (t.Type === 'CREDIT_SALE' && t.CourseName) {
      detailedDescription = `Doanh thu từ bán khóa học: "${t.CourseName}" (Đơn hàng #${t.OrderID || 'N/A'})`;
      if (t.CustomerEmail)
        detailedDescription += ` - Người mua: ${t.CustomerEmail}`;
    } else if (t.Type === 'DEBIT_WITHDRAWAL' && t.PayoutMethodName) {
      detailedDescription = `Rút tiền thành công qua ${t.PayoutMethodName} (Yêu cầu Payout #${t.RelatedEntityID})`;
    } // Thêm các case khác nếu cần (REFUND, FEE,...)
    console.log(t);
    return {
      transactionId: t.TransactionID,
      transactionTimestamp: t.TransactionTimestamp,
      type: t.Type,
      amount: parseFloat(t.Amount.toString()), // Đảm bảo là number
      currencyId: t.CurrencyID,
      description: detailedDescription,
      relatedEntityType: t.RelatedEntityType,
      relatedEntityId: t.RelatedEntityID,
      sourcePaymentId: t.SourcePaymentID, // ID của CoursePayments
      orderItemId: t.Type === 'CREDIT_SALE' ? t.SourceOrderItemID : null, // ID của OrderItem
      courseId: t.Type === 'CREDIT_SALE' ? t.CourseID : null,
      courseName: t.Type === 'CREDIT_SALE' ? t.CourseName : null,
      currentBalanceAfterTransaction: parseFloat(t.CurrentBalance.toString()),
      status: t.PayoutStatusID || t.CoursePaymentStatusID,
    };
  });

  return {
    transactions, // Đổi tên key
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

    // Gộp dữ liệu: tạo một map từ totalRevenueData để dễ dàng truy cập
    const revenueMap = new Map();
    totalRevenueData.forEach((item) => {
      revenueMap.set(item.month, item.totalRevenue);
    });

    const combinedEarnings = netEarningsData.map((netItem) => {
      const totalRevenue = revenueMap.get(netItem.month) || 0; // Lấy totalRevenue tương ứng, nếu không có thì là 0
      return {
        month: netItem.month,
        totalRevenue,
        netEarnings: netItem.netEarnings,
      };
    });

    // Đảm bảo tất cả các tháng có totalRevenue cũng được bao gồm (trường hợp có total revenue nhưng không có net earning)
    revenueMap.forEach((totalRevenue, month) => {
      if (!combinedEarnings.some((e) => e.month === month)) {
        combinedEarnings.push({ month, totalRevenue, netEarnings: 0 });
      }
    });

    // Sắp xếp lại theo tháng
    combinedEarnings.sort((a, b) => a.month.localeCompare(b.month));

    return {
      earnings: combinedEarnings,
      currencyId: Currency.VND, // Giả sử VND
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

    // Tính tổng netEarnings của tất cả các khóa học trong period để tính %
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
      currencyId: Currency.VND, // Giả sử VND
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

module.exports = {
  getMyAvailableBalance,
  requestWithdrawal,
  reviewWithdrawalRequest,
  getPayouts,
  processPayoutExecution,
  // getMyWithdrawalHistory,
  // getMyPayoutHistory,
  getMyTransactions,
  getWithdrawalActivityHistory,
  getMyMonthlyEarnings,
  getMyRevenueByCourse,
};
