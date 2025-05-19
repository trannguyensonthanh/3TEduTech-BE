// Import thêm ApiError và httpStatus nếu cần ném lỗi từ repo
const httpStatus = require('http-status').status;
const ApiError = require('../../core/errors/ApiError');

const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');

/**
 * Thêm phương thức thanh toán mới cho instructor.
 * @param {object} data - { AccountID, MethodID, Details (JSON string), IsPrimary, Status }
 * @returns {Promise<object>}
 */
const addPayoutMethod = async (data) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, data.AccountID);
    request.input('MethodID', sql.VarChar, data.MethodID);
    request.input('Details', sql.NVarChar, data.Details); // Truyền JSON string
    request.input('IsPrimary', sql.Bit, data.IsPrimary || 0);
    request.input('Status', sql.VarChar, data.Status || 'ACTIVE');

    const result = await request.query(`
            INSERT INTO InstructorPayoutMethods (AccountID, MethodID, Details, IsPrimary, Status)
            OUTPUT Inserted.*
            VALUES (@AccountID, @MethodID, @Details, @IsPrimary, @Status);
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error adding payout method:', error);
    if (error.number === 2627 || error.number === 2601) {
      // Unique AccountID + MethodID
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Bạn đã thêm phương thức ${data.MethodID} này rồi.`
      );
    }
    // Lỗi JSON constraint
    if (error.message.includes('JSON')) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Dữ liệu chi tiết không đúng định dạng JSON.'
      );
    }
    throw error;
  }
};

/**
 * Cập nhật chi tiết hoặc trạng thái của phương thức thanh toán.
 * @param {number} payoutMethodId
 * @param {object} updateData - { Details?, Status?, IsPrimary? }
 * @returns {Promise<object|null>}
 */
const updatePayoutMethod = async (payoutMethodId, updateData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('PayoutMethodID', sql.BigInt, payoutMethodId);
    request.input('UpdatedAt', sql.DateTime2, new Date());

    const setClauses = ['UpdatedAt = @UpdatedAt'];
    if (updateData.Details !== undefined) {
      request.input('Details', sql.NVarChar, updateData.Details); // JSON string
      setClauses.push('Details = @Details');
    }
    if (updateData.Status !== undefined) {
      request.input('Status', sql.VarChar, updateData.Status);
      setClauses.push('Status = @Status');
    }
    if (updateData.IsPrimary !== undefined) {
      request.input('IsPrimary', sql.Bit, updateData.IsPrimary);
      setClauses.push('IsPrimary = @IsPrimary');
    }

    if (setClauses.length === 1) return null;

    const result = await request.query(`
            UPDATE InstructorPayoutMethods
            SET ${setClauses.join(', ')}
            OUTPUT Inserted.*
            WHERE PayoutMethodID = @PayoutMethodID;
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error(`Error updating payout method ${payoutMethodId}:`, error);
    if (error.message.includes('JSON')) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Dữ liệu chi tiết không đúng định dạng JSON.'
      );
    }
    throw error;
  }
};

/**
 * Tìm phương thức thanh toán bằng ID.
 * @param {number} payoutMethodId
 * @returns {Promise<object|null>}
 */
const findPayoutMethodById = async (payoutMethodId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('PayoutMethodID', sql.BigInt, payoutMethodId);
    const result = await request.query(`
            SELECT ipm.*, pm.MethodName
            FROM InstructorPayoutMethods ipm
            JOIN PaymentMethods pm ON ipm.MethodID = pm.MethodID
            WHERE ipm.PayoutMethodID = @PayoutMethodID;
        `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error finding payout method by ID ${payoutMethodId}:`, error);
    throw error;
  }
};

/**
 * Tìm các phương thức thanh toán của một instructor.
 * @param {number} accountId
 * @returns {Promise<Array<object>>}
 */
const findPayoutMethodsByAccountId = async (accountId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, accountId);
    const result = await request.query(`
            SELECT ipm.*, pm.MethodName
            FROM InstructorPayoutMethods ipm
            JOIN PaymentMethods pm ON ipm.MethodID = pm.MethodID
            WHERE ipm.AccountID = @AccountID
            ORDER BY IsPrimary DESC, UpdatedAt DESC; -- Ưu tiên primary, sau đó là mới nhất
        `);
    return result.recordset;
  } catch (error) {
    logger.error(
      `Error finding payout methods for account ${accountId}:`,
      error
    );
    throw error;
  }
};

/**
 * Tìm phương thức thanh toán cụ thể (vd: BANK_TRANSFER) của instructor.
 * @param {number} accountId
 * @param {string} methodId
 * @returns {Promise<object|null>}
 */
const findSpecificPayoutMethod = async (accountId, methodId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, accountId);
    request.input('MethodID', sql.VarChar, methodId);
    const result = await request.query(`
            SELECT ipm.*, pm.MethodName
            FROM InstructorPayoutMethods ipm
            JOIN PaymentMethods pm ON ipm.MethodID = pm.MethodID
            WHERE ipm.AccountID = @AccountID AND ipm.MethodID = @MethodID;
        `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(
      `Error finding specific payout method for account ${accountId}, method ${methodId}:`,
      error
    );
    throw error;
  }
};

/**
 * Xóa phương thức thanh toán bằng ID.
 * @param {number} payoutMethodId
 * @returns {Promise<number>} - Số dòng bị ảnh hưởng.
 */
const deletePayoutMethodById = async (payoutMethodId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('PayoutMethodID', sql.BigInt, payoutMethodId);
    const result = await request.query(
      'DELETE FROM InstructorPayoutMethods WHERE PayoutMethodID = @PayoutMethodID'
    );
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error deleting payout method ${payoutMethodId}:`, error);
    throw error;
  }
};

/**
 * Đặt một phương thức làm chính, bỏ chính các phương thức khác (trong transaction).
 * @param {number} accountId
 * @param {number} payoutMethodIdToSetPrimary
 * @param {object} transaction
 * @returns {Promise<void>}
 */
const setPrimaryPayoutMethod = async (
  accountId,
  payoutMethodIdToSetPrimary,
  transaction
) => {
  // Bỏ primary cũ
  const clearRequest = transaction.request();
  clearRequest.input('AccountID', sql.BigInt, accountId);
  clearRequest.input('PayoutMethodID', sql.BigInt, payoutMethodIdToSetPrimary);
  clearRequest.input('IsPrimaryFalse', sql.Bit, 0);
  await clearRequest.query(`
        UPDATE InstructorPayoutMethods
        SET IsPrimary = @IsPrimaryFalse
        WHERE AccountID = @AccountID AND PayoutMethodID != @PayoutMethodID AND IsPrimary = 1;
    `);

  // Set primary mới
  const setRequest = transaction.request();
  setRequest.input('PayoutMethodID', sql.BigInt, payoutMethodIdToSetPrimary);
  setRequest.input('IsPrimaryTrue', sql.Bit, 1);
  await setRequest.query(`
        UPDATE InstructorPayoutMethods
        SET IsPrimary = @IsPrimaryTrue
        WHERE PayoutMethodID = @PayoutMethodID;
    `);
};

/**
 * Tìm phương thức thanh toán bằng ID và AccountID (để kiểm tra sở hữu).
 * @param {number} payoutMethodId
 * @param {number} accountId
 * @returns {Promise<object|null>}
 */
const findPayoutMethodByIdAndAccountId = async (payoutMethodId, accountId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('PayoutMethodID', sql.BigInt, payoutMethodId);
    request.input('AccountID', sql.BigInt, accountId);
    const result = await request.query(`
            SELECT ipm.*, pm.MethodName
            FROM InstructorPayoutMethods ipm
            JOIN PaymentMethods pm ON ipm.MethodID = pm.MethodID
            WHERE ipm.PayoutMethodID = @PayoutMethodID AND ipm.AccountID = @AccountID;
        `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(
      `Error finding payout method by ID ${payoutMethodId} for account ${accountId}:`,
      error
    );
    throw error;
  }
};

module.exports = {
  addPayoutMethod,
  updatePayoutMethod,
  findPayoutMethodById,
  findPayoutMethodsByAccountId,
  findSpecificPayoutMethod,
  deletePayoutMethodById,
  setPrimaryPayoutMethod,
  findPayoutMethodByIdAndAccountId,
};
