// File: src/api/financials/payout.repository.js

const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');
const PayoutStatus = require('../../core/enums/PayoutStatus');
const WithdrawalStatus = require('../../core/enums/WithdrawalStatus');

// === Withdrawal Requests ===

const createWithdrawalRequest = async (requestData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('InstructorID', sql.BigInt, requestData.InstructorID);
    request.input(
      'RequestedAmount',
      sql.Decimal(18, 4),
      requestData.RequestedAmount
    );
    request.input(
      'RequestedCurrencyID',
      sql.VarChar,
      requestData.RequestedCurrencyID
    );
    request.input('PaymentMethodID', sql.VarChar, requestData.PaymentMethodID);
    request.input(
      'PayoutDetailsSnapshot',
      sql.NVarChar,
      requestData.PayoutDetailsSnapshot
    ); // JSON string or text
    request.input('Status', sql.VarChar, requestData.Status || 'PENDING');
    request.input('InstructorNotes', sql.NVarChar, requestData.InstructorNotes);

    const result = await request.query(`
            INSERT INTO WithdrawalRequests (
                InstructorID, RequestedAmount, RequestedCurrencyID, PaymentMethodID,
                PayoutDetailsSnapshot, Status, InstructorNotes
            )
            OUTPUT Inserted.*
            VALUES (
                @InstructorID, @RequestedAmount, @RequestedCurrencyID, @PaymentMethodID,
                @PayoutDetailsSnapshot, @Status, @InstructorNotes
            );
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error creating withdrawal request:', error);
    throw error;
  }
};

const findWithdrawalRequestById = async (requestId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('RequestID', sql.BigInt, requestId);
    // Join để lấy thông tin instructor
    const result = await request.query(`
            SELECT wr.*, up.FullName as InstructorName, acc.Email as InstructorEmail
            FROM WithdrawalRequests wr
            JOIN Accounts acc ON wr.InstructorID = acc.AccountID
            JOIN UserProfiles up ON wr.InstructorID = up.AccountID
            WHERE wr.RequestID = @RequestID;
        `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error finding withdrawal request ${requestId}:`, error);
    throw error;
  }
};

const updateWithdrawalRequestStatus = async (
  requestId,
  updateData,
  transaction = null
) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('RequestID', sql.BigInt, requestId);
  executor.input('UpdatedAt', sql.DateTime2, new Date());

  const setClauses = ['UpdatedAt = @UpdatedAt'];
  if (updateData.Status !== undefined) {
    executor.input('Status', sql.VarChar, updateData.Status);
    setClauses.push('Status = @Status');
  }
  if (updateData.AdminID !== undefined) {
    executor.input('AdminID', sql.BigInt, updateData.AdminID);
    setClauses.push('AdminID = @AdminID');
  }
  if (updateData.AdminNotes !== undefined) {
    executor.input('AdminNotes', sql.NVarChar, updateData.AdminNotes);
    setClauses.push('AdminNotes = @AdminNotes');
  }
  if (updateData.ProcessedAt !== undefined) {
    executor.input('ProcessedAt', sql.DateTime2, updateData.ProcessedAt);
    setClauses.push('ProcessedAt = @ProcessedAt');
  }
  if (updateData.PayoutID !== undefined) {
    executor.input('PayoutID', sql.BigInt, updateData.PayoutID);
    setClauses.push('PayoutID = @PayoutID');
  }

  if (setClauses.length === 1) return null;

  try {
    const result = await executor.query(`
            UPDATE WithdrawalRequests SET ${setClauses.join(', ')}
            OUTPUT Inserted.*
            WHERE RequestID = @RequestID;
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error(
      `Error updating withdrawal request ${requestId} status:`,
      error
    );
    throw error;
  }
};

// === Payouts ===

const createPayout = async (payoutData, transaction) => {
  const request = transaction.request(); // Payout thường được tạo trong transaction khi xử lý request
  request.input('InstructorID', sql.BigInt, payoutData.InstructorID);
  request.input('Amount', sql.Decimal(18, 4), payoutData.Amount); // Số tiền approve
  request.input('CurrencyID', sql.VarChar, payoutData.CurrencyID);
  // ActualAmount, ActualCurrencyID, ExchangeRate sẽ là NULL ban đầu
  request.input('PaymentMethodID', sql.VarChar, payoutData.PaymentMethodID);
  request.input('PayoutDetails', sql.NVarChar, payoutData.PayoutDetails); // Snapshot bank info
  request.input('Fee', sql.Decimal(18, 4), payoutData.Fee || 0);
  request.input(
    'PayoutStatusID',
    sql.VarChar,
    payoutData.PayoutStatusID || PayoutStatus.PENDING
  );
  request.input(
    'RequestedAt',
    sql.DateTime2,
    payoutData.RequestedAt || new Date()
  ); // Có thể lấy từ Request
  // ProcessedAt, CompletedAt sẽ là NULL ban đầu
  request.input('AdminID', sql.BigInt, payoutData.AdminID);
  request.input('AdminNote', sql.NVarChar, payoutData.AdminNote);

  try {
    const result = await request.query(`
            INSERT INTO Payouts (
                InstructorID, Amount, CurrencyID, PaymentMethodID, PayoutDetails, Fee,
                PayoutStatusID, RequestedAt, AdminID, AdminNote
            )
            OUTPUT Inserted.*
            VALUES (
                @InstructorID, @Amount, @CurrencyID, @PaymentMethodID, @PayoutDetails, @Fee,
                @PayoutStatusID, @RequestedAt, @AdminID, @AdminNote
            );
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error creating payout record:', error);
    throw error;
  }
};

// Thêm hàm updatePayoutStatus khi thực hiện chi trả thực tế (Admin action)
const updatePayoutExecutionStatus = async (payoutId, updateData) => {
  // updateData có thể chứa: PayoutStatusID, ProcessedAt, CompletedAt, Fee (nếu có thay đổi), ActualAmount, ActualCurrencyID, ExchangeRate
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('PayoutID', sql.BigInt, payoutId);
    request.input('UpdatedAt', sql.DateTime2, new Date());

    const setClauses = ['UpdatedAt = @UpdatedAt'];
    // Add inputs and set clauses based on updateData keys
    if (updateData.PayoutStatusID) {
      request.input('PayoutStatusID', sql.VarChar, updateData.PayoutStatusID);
      setClauses.push('PayoutStatusID = @PayoutStatusID');
    }
    if (updateData.ProcessedAt) {
      request.input('ProcessedAt', sql.DateTime2, updateData.ProcessedAt);
      setClauses.push('ProcessedAt = @ProcessedAt');
    }
    if (updateData.CompletedAt) {
      request.input('CompletedAt', sql.DateTime2, updateData.CompletedAt);
      setClauses.push('CompletedAt = @CompletedAt');
    }
    if (updateData.ActualAmount) {
      request.input(
        'ActualAmount',
        sql.Decimal(36, 18),
        updateData.ActualAmount
      );
      setClauses.push('ActualAmount = @ActualAmount');
    }
    if (updateData.ActualCurrencyID) {
      request.input(
        'ActualCurrencyID',
        sql.VarChar,
        updateData.ActualCurrencyID
      );
      setClauses.push('ActualCurrencyID = @ActualCurrencyID');
    }
    if (updateData.ExchangeRate) {
      request.input(
        'ExchangeRate',
        sql.Decimal(24, 12),
        updateData.ExchangeRate
      );
      setClauses.push('ExchangeRate = @ExchangeRate');
    }
    if (updateData.Fee) {
      request.input('Fee', sql.Decimal(18, 4), updateData.Fee);
      setClauses.push('Fee = @Fee');
    }
    // Thêm AdminNote nếu cần

    if (setClauses.length === 1) return null;

    const result = await request.query(`
               UPDATE Payouts SET ${setClauses.join(', ')}
               OUTPUT Inserted.*
               WHERE PayoutID = @PayoutID;
           `);
    return result.recordset[0];
  } catch (error) {
    logger.error(
      `Error updating payout execution status for ${payoutId}:`,
      error
    );
    throw error;
  }
};

/**
 * Tìm Payout bằng ID.
 * @param {number} payoutId
 * @returns {Promise<object|null>}
 */
const findPayoutById = async (payoutId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('PayoutID', sql.BigInt, payoutId);
    // Join để lấy thêm thông tin instructor, request liên quan nếu cần
    const result = await request.query(`
          SELECT p.*, wr.RequestID, up.FullName as InstructorName, acc.Email as InstructorEmail
          FROM Payouts p
          JOIN Accounts acc ON p.InstructorID = acc.AccountID
          JOIN UserProfiles up ON p.InstructorID = up.AccountID
          LEFT JOIN WithdrawalRequests wr ON p.PayoutID = wr.PayoutID -- Join để lấy RequestID nếu có
          WHERE p.PayoutID = @PayoutID;
      `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error finding payout ${payoutId}:`, error);
    throw error;
  }
};

/**
 * Lấy danh sách Payouts với bộ lọc và phân trang (cho Admin).
 * @param {object} filters - { instructorId, statusId, paymentMethodId }
 * @param {object} options - { page, limit, sortBy }
 * @returns {Promise<{ payouts: object[], total: number }>}
 */
const findAllPayouts = async (filters = {}, options = {}) => {
  const { instructorId, statusId, paymentMethodId } = filters;
  const { page = 1, limit = 10, sortBy = 'RequestedAt:desc' } = options;
  const offset = (page - 1) * limit;

  try {
    const pool = await getConnection();
    const request = pool.request();

    let query = `
          SELECT
              p.PayoutID, p.Amount, p.CurrencyID, p.PayoutStatusID, p.RequestedAt,
              p.ProcessedAt, p.CompletedAt, p.PaymentMethodID,
              up.FullName as InstructorName, p.InstructorID,
              adm_up.FullName as AdminName -- Admin xử lý (nếu có)
          FROM Payouts p
          JOIN UserProfiles up ON p.InstructorID = up.AccountID
          LEFT JOIN Accounts adm_acc ON p.AdminID = adm_acc.AccountID
          LEFT JOIN UserProfiles adm_up ON adm_acc.AccountID = adm_up.AccountID
      `;
    let countQuery = `
          SELECT COUNT(p.PayoutID) as total
          FROM Payouts p
          JOIN UserProfiles up ON p.InstructorID = up.AccountID
      `; // Count đơn giản hơn
    const whereClauses = [];

    if (instructorId) {
      request.input('InstructorID', sql.BigInt, instructorId);
      whereClauses.push('p.InstructorID = @InstructorID');
    }
    if (statusId) {
      request.input('PayoutStatusID', sql.VarChar, statusId);
      whereClauses.push('p.PayoutStatusID = @PayoutStatusID');
    }
    if (paymentMethodId) {
      request.input('PaymentMethodID', sql.VarChar, paymentMethodId);
      whereClauses.push('p.PaymentMethodID = @PaymentMethodID');
    }

    const whereCondition =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    query += ` ${whereCondition}`;
    countQuery += ` ${whereCondition}`; // Áp dụng filter cho count

    const countResult = await request.query(countQuery);
    const { total } = countResult.recordset[0];

    // Sắp xếp
    let orderByClause = 'ORDER BY p.RequestedAt DESC'; // Mặc định
    if (sortBy) {
      const [sortField, sortOrder] = sortBy.split(':');
      const allowedSortFields = {
        RequestedAt: 'p.RequestedAt',
        ProcessedAt: 'p.ProcessedAt',
        CompletedAt: 'p.CompletedAt',
        Amount: 'p.Amount',
        InstructorName: 'up.FullName',
      };
      const orderDirection =
        sortOrder?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      if (allowedSortFields[sortField]) {
        orderByClause = `ORDER BY ${allowedSortFields[sortField]} ${orderDirection}`;
      }
    }
    query += ` ${orderByClause}`;

    // Phân trang
    request.input('Limit', sql.Int, limit);
    request.input('Offset', sql.Int, offset);
    query += ' OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY';

    const dataResult = await request.query(query);
    return { payouts: dataResult.recordset, total };
  } catch (error) {
    logger.error('Error finding all payouts:', error);
    throw error;
  }
};

// /**
//  * Lấy lịch sử yêu cầu rút tiền của một giảng viên (phân trang).
//  * @param {number} instructorId
//  * @param {object} options - { page, limit, status }
//  * @returns {Promise<{requests: object[], total: number}>}
//  */
// const findWithdrawalRequestsByInstructor = async (
//   instructorId,
//   options = {}
// ) => {
//   const { page = 1, limit = 10, status = '' } = options;
//   const offset = (page - 1) * limit;

//   try {
//     const pool = await getConnection();
//     const request = pool.request();
//     request.input('InstructorID', sql.BigInt, instructorId);

//     const whereClauses = ['InstructorID = @InstructorID'];
//     if (status) {
//       request.input('Status', sql.VarChar, status);
//       whereClauses.push('Status = @Status');
//     }
//     const whereCondition = `WHERE ${whereClauses.join(' AND ')}`;

//     const commonQuery = `FROM WithdrawalRequests ${whereCondition}`;

//     const countResult = await request.query(
//       `SELECT COUNT(*) as total ${commonQuery}`
//     );
//     const { total } = countResult.recordset[0];

//     request.input('Limit', sql.Int, limit);
//     request.input('Offset', sql.Int, offset);
//     // Lấy các cột cần thiết cho lịch sử
//     const dataResult = await request.query(`
//           SELECT RequestID, RequestedAmount, RequestedCurrencyID, Status, CreatedAt, ProcessedAt, AdminNotes
//           ${commonQuery}
//           ORDER BY CreatedAt DESC
//           OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
//       `);

//     return { requests: dataResult.recordset, total };
//   } catch (error) {
//     logger.error(
//       `Error finding withdrawal requests for instructor ${instructorId}:`,
//       error
//     );
//     throw error;
//   }
// };

// /**
//  * Lấy lịch sử chi trả (Payouts) của một giảng viên (phân trang).
//  * @param {number} instructorId
//  * @param {object} options - { page, limit, statusId }
//  * @returns {Promise<{payouts: object[], total: number}>}
//  */
// const findPayoutsByInstructor = async (instructorId, options = {}) => {
//   const { page = 1, limit = 10, statusId = '' } = options;
//   const offset = (page - 1) * limit;

//   try {
//     const pool = await getConnection();
//     const request = pool.request();
//     request.input('InstructorID', sql.BigInt, instructorId);

//     const whereClauses = ['InstructorID = @InstructorID'];
//     if (statusId) {
//       request.input('PayoutStatusID', sql.VarChar, statusId);
//       whereClauses.push('PayoutStatusID = @PayoutStatusID');
//     }
//     const whereCondition = `WHERE ${whereClauses.join(' AND ')}`;

//     const commonQuery = `FROM Payouts ${whereCondition}`;

//     const countResult = await request.query(
//       `SELECT COUNT(*) as total ${commonQuery}`
//     );
//     const { total } = countResult.recordset[0];

//     request.input('Limit', sql.Int, limit);
//     request.input('Offset', sql.Int, offset);
//     // Lấy các cột cần thiết cho lịch sử
//     const dataResult = await request.query(`
//           SELECT PayoutID, Amount, CurrencyID, PayoutStatusID, RequestedAt, ProcessedAt, CompletedAt, PaymentMethodID, Fee, AdminNote
//           ${commonQuery}
//           ORDER BY RequestedAt DESC
//           OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
//       `);

//     return { payouts: dataResult.recordset, total };
//   } catch (error) {
//     logger.error(
//       `Error finding payouts for instructor ${instructorId}:`,
//       error
//     );
//     throw error;
//   }
// };

/**
 * Lấy lịch sử hoạt động rút tiền tổng hợp của một giảng viên.
 * Join WithdrawalRequests với Payouts và các bảng liên quan.
 * @param {number} instructorId
 * @param {object} options - { page, limit, overallStatus, dateFrom, dateTo, sortBy }
 * @returns {Promise<{activities: object[], total: number}>}
 */
const findWithdrawalActivities = async (instructorId, options = {}) => {
  const {
    page = 1,
    limit = 10,
    overallStatus = null,
    dateFrom = null,
    dateTo = null,
    sortBy = 'requestedAt:desc',
  } = options;
  const offset = (page - 1) * limit;

  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('InstructorID', sql.BigInt, instructorId);

    const selectFields = `
            wr.RequestID,
            wr.RequestedAmount,
            wr.RequestedCurrencyID,
            wr.Status as RequestStatus,
            wr.CreatedAt as RequestedAt,
            wr.InstructorNotes,
            wr_admin.FullName as RequestAdminName, -- Admin xử lý request
            wr.AdminNotes as AdminNotesForRequest,
            wr.ProcessedAt as RequestProcessedAt,
            wr.PayoutDetailsSnapshot, -- Thông tin bank/paypal lúc yêu cầu

            p.PayoutID,
            p.Amount as PayoutAmount, -- Số tiền thực tế được duyệt để payout (trước phí)
            p.CurrencyID as PayoutCurrencyID,
            p.ActualAmount as ActualAmountPaid,
            p.ActualCurrencyID as ActualPayoutCurrencyID,
            p.ExchangeRate as ExchangeRateUsed,
            p.Fee as TransactionFee,
            p.PayoutStatusID,
            p_status.StatusName as PayoutStatusName,
            pm.MethodName as PaymentMethodUsed,
            p.PayoutDetails as PayoutExecutionDetails, -- Có thể khác với Snapshot nếu admin sửa
            p.CompletedAt as PaymentCompletedAt,
            p_admin.FullName as PayoutAdminName, -- Admin thực hiện payout
            p.AdminNote as AdminNotesForPayout
            -- ExternalTransactionID của Payout không có trong bảng Payouts, mà ở CoursePayments (nếu là thanh toán vào)
            -- Nếu bạn có cột ExternalTransactionID trong Payouts cho giao dịch chi ra, hãy thêm vào.
        `;

    const fromJoins = `
            FROM WithdrawalRequests wr
            LEFT JOIN Payouts p ON wr.PayoutID = p.PayoutID
            LEFT JOIN Accounts wr_admin_acc ON wr.AdminID = wr_admin_acc.AccountID
            LEFT JOIN UserProfiles wr_admin ON wr_admin_acc.AccountID = wr_admin.AccountID
            LEFT JOIN PayoutStatuses p_status ON p.PayoutStatusID = p_status.StatusID
            LEFT JOIN PaymentMethods pm ON p.PaymentMethodID = pm.MethodID
            LEFT JOIN Accounts p_admin_acc ON p.AdminID = p_admin_acc.AccountID
            LEFT JOIN UserProfiles p_admin ON p_admin_acc.AccountID = p_admin.AccountID
        `;

    const whereClauses = ['wr.InstructorID = @InstructorID'];

    if (overallStatus) {
      request.input('OverallStatus', sql.VarChar, overallStatus);
      // Map overallStatus sang điều kiện query cụ thể
      switch (overallStatus.toUpperCase()) {
        case 'PENDING': // Yêu cầu đang chờ admin duyệt
          whereClauses.push(`wr.Status = '${WithdrawalStatus.PENDING}'`);
          break;
        case 'PROCESSING': // Yêu cầu đã duyệt, đang chờ chi trả hoặc đang xử lý chi trả
          whereClauses.push(
            `(wr.Status = '${WithdrawalStatus.PROCESSING}' OR p.PayoutStatusID = '${PayoutStatus.PROCESSING}' OR p.PayoutStatusID = '${PayoutStatus.PENDING}')`
          );
          break;
        case 'COMPLETED': // Payout đã hoàn thành (PAID)
          whereClauses.push(`p.PayoutStatusID = '${PayoutStatus.PAID}'`);
          break;
        case 'FAILED': // Payout thất bại
          whereClauses.push(`p.PayoutStatusID = '${PayoutStatus.FAILED}'`);
          break;
        case 'REJECTED': // Yêu cầu bị từ chối
          whereClauses.push(`wr.Status = '${WithdrawalStatus.REJECTED}'`);
          break;
        case 'CANCELLED': // Yêu cầu bị hủy (nếu có trạng thái này)
          whereClauses.push(`wr.Status = '${WithdrawalStatus.CANCELLED}'`);
          break;
        default:
          // Bỏ qua nếu overallStatus không hợp lệ
          break;
      }
    }
    if (dateFrom) {
      request.input('DateFrom', sql.DateTime2, new Date(dateFrom));
      whereClauses.push('wr.CreatedAt >= @DateFrom'); // Lọc theo ngày yêu cầu
    }
    if (dateTo) {
      const inclusiveEndDate = new Date(dateTo);
      inclusiveEndDate.setDate(inclusiveEndDate.getDate() + 1);
      request.input('DateTo', sql.DateTime2, inclusiveEndDate);
      whereClauses.push('wr.CreatedAt < @DateTo');
    }

    const whereCondition = `WHERE ${whereClauses.join(' AND ')}`;
    const commonQueryStructure = `${fromJoins} ${whereCondition}`;

    const countResult = await request.query(
      `SELECT COUNT(DISTINCT wr.RequestID) as total ${commonQueryStructure}`
    );
    const { total } = countResult.recordset[0];

    let orderByClause = 'ORDER BY wr.CreatedAt DESC'; // Mặc định
    if (sortBy === 'requestedAt:asc')
      orderByClause = 'ORDER BY wr.CreatedAt ASC';
    else if (sortBy === 'paymentCompletedAt:desc')
      orderByClause = 'ORDER BY p.CompletedAt DESC, wr.CreatedAt DESC';
    else if (sortBy === 'paymentCompletedAt:asc')
      orderByClause = 'ORDER BY p.CompletedAt ASC, wr.CreatedAt ASC';

    request.input('Limit', sql.Int, limit);
    request.input('Offset', sql.Int, offset);

    const dataResult = await request.query(`
            SELECT ${selectFields}
            ${commonQueryStructure}
            ${orderByClause}
            OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
        `);

    return { activities: dataResult.recordset, total };
  } catch (error) {
    logger.error(
      `Error finding withdrawal activities for instructor ${instructorId}:`,
      error
    );
    throw error;
  }
};

/**
 * Tính tổng số tiền đang trong các yêu cầu rút tiền chờ xử lý của giảng viên.
 * @param {number} instructorId
 * @param {object} [transaction=null]
 * @returns {Promise<number>}
 */
const getPendingPayoutsAmount = async (instructorId, transaction = null) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('InstructorID', sql.BigInt, instructorId);
  // Các trạng thái được coi là đang chờ xử lý
  const pendingStatuses = [
    WithdrawalStatus.PENDING,
    WithdrawalStatus.PROCESSING,
  ];
  const statusPlaceholders = pendingStatuses
    .map((_, i) => `@status${i}`)
    .join(',');
  pendingStatuses.forEach((s, i) =>
    executor.input(`status${i}`, sql.VarChar, s)
  );

  try {
    const result = await executor.query(`
            SELECT ISNULL(SUM(RequestedAmount), 0) as pendingAmount
            FROM WithdrawalRequests
            WHERE InstructorID = @InstructorID AND Status IN (${statusPlaceholders});
        `);
    return result.recordset[0].pendingAmount;
  } catch (error) {
    logger.error(
      `Error getting pending payouts amount for instructor ${instructorId}:`,
      error
    );
    throw error;
  }
};

module.exports = {
  // Withdrawals
  createWithdrawalRequest,
  findWithdrawalRequestById,
  updateWithdrawalRequestStatus,
  findPayoutById,
  findAllPayouts,
  // Payouts
  createPayout,
  updatePayoutExecutionStatus,
  // findWithdrawalRequestsByInstructor, // ko dùng nữa
  // findPayoutsByInstructor, // ko dùng nữa
  findWithdrawalActivities,
  getPendingPayoutsAmount,
};
