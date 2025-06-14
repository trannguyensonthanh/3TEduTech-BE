const httpStatus = require('http-status').status;
const { isNaN } = require('lodash');
const ApiError = require('../../core/errors/ApiError');
const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');
const PaymentStatus = require('../../core/enums/PaymentStatus');

/**
 * Tạo bản ghi CoursePayments mới.
 * @param {object} paymentData - Dữ liệu thanh toán.
 * @param {object} [transaction=null]
 * @returns {Promise<object>} - Bản ghi payment vừa tạo.
 */
const createCoursePayment = async (paymentData, transaction = null) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();

  executor.input('OrderID', sql.BigInt, paymentData.OrderID);
  executor.input('FinalAmount', sql.Decimal(18, 4), paymentData.FinalAmount);
  executor.input('PaymentMethodID', sql.VarChar, paymentData.PaymentMethodID);
  executor.input(
    'OriginalCurrencyID',
    sql.VarChar,
    paymentData.OriginalCurrencyID
  );
  executor.input(
    'OriginalAmount',
    sql.Decimal(18, 4),
    paymentData.OriginalAmount
  );
  executor.input(
    'ExternalTransactionID',
    sql.VarChar,
    paymentData.ExternalTransactionID
  );
  executor.input(
    'ConvertedCurrencyID',
    sql.VarChar,
    paymentData.ConvertedCurrencyID
  );
  executor.input(
    'ConvertedTotalAmount',
    sql.Decimal(18, 4),
    paymentData.ConvertedTotalAmount
  );
  executor.input(
    'ConversionRate',
    sql.Decimal(24, 12),
    paymentData.ConversionRate || 1
  );
  executor.input(
    'TransactionFee',
    sql.Decimal(18, 4),
    paymentData.TransactionFee || 0
  );
  executor.input(
    'PaymentStatusID',
    sql.VarChar,
    paymentData.PaymentStatusID || PaymentStatus.PENDING
  );
  executor.input(
    'TransactionCompletedAt',
    sql.DateTime2,
    paymentData.TransactionCompletedAt
  );
  executor.input('AdditionalInfo', sql.NVarChar, paymentData.AdditionalInfo);

  try {
    const result = await executor.query(`
            INSERT INTO CoursePayments (
                OrderID, FinalAmount, PaymentMethodID, OriginalCurrencyID, OriginalAmount,
                ExternalTransactionID, ConvertedCurrencyID, ConvertedTotalAmount, ConversionRate,
                TransactionFee, PaymentStatusID, TransactionCompletedAt, AdditionalInfo
            )
            OUTPUT Inserted.*
            VALUES (
                @OrderID, @FinalAmount, @PaymentMethodID, @OriginalCurrencyID, @OriginalAmount,
                @ExternalTransactionID, @ConvertedCurrencyID, @ConvertedTotalAmount, @ConversionRate,
                @TransactionFee, @PaymentStatusID, @TransactionCompletedAt, @AdditionalInfo
            );
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error creating course payment:', error);
    if (error.number === 2627 || error.number === 2601) {
      logger.warn(
        `Attempt to create duplicate payment record for OrderID=${paymentData.OrderID}`
      );
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Lỗi khi tạo bản ghi thanh toán (trùng lặp).'
      );
    }
    throw error;
  }
};

/**
 * Tìm CoursePayment bằng OrderID.
 * @param {number} orderId
 * @returns {Promise<object|null>}
 */
const findPaymentByOrderId = async (orderId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('OrderID', sql.BigInt, orderId);
    const result = await request.query(
      'SELECT * FROM CoursePayments WHERE OrderID = @OrderID;'
    );
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error finding payment for order ${orderId}:`, error);
    throw error;
  }
};

const findPendingPaymentByOrderId = async (orderId, methodId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('OrderID', sql.BigInt, orderId);
    request.input('PaymentMethodID', sql.VarChar, methodId);
    request.input('PendingStatus', sql.VarChar, PaymentStatus.PENDING);

    // Lấy bản ghi PENDING gần đây nhất
    const result = await request.query(`
        SELECT TOP 1 * FROM CoursePayments 
        WHERE OrderID = @OrderID 
          AND PaymentMethodID = @PaymentMethodID 
          AND PaymentStatusID = @PendingStatus
        ORDER BY CreatedAt DESC;
    `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error finding pending payment for order ${orderId}:`, error);
    throw error;
  }
};

/**
 * Cập nhật trạng thái thanh toán.
 * @param {number} paymentId
 * @param {string} statusId
 * @param {Date|null} completedAt
 * @param {string|null} externalTxnId - Có thể cập nhật nếu IPN trả về sau
 * @param {object} [transaction=null]
 * @returns {Promise<object>}
 */
const updatePaymentStatus = async (
  paymentId,
  statusId,
  completedAt = null,
  externalTxnId = null,
  transaction = null
) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('PaymentID', sql.BigInt, paymentId);
  executor.input('PaymentStatusID', sql.VarChar, statusId);
  executor.input('UpdatedAt', sql.DateTime2, new Date());

  const setClauses = [
    'PaymentStatusID = @PaymentStatusID',
    'UpdatedAt = @UpdatedAt',
  ];
  if (completedAt) {
    executor.input('TransactionCompletedAt', sql.DateTime2, completedAt);
    setClauses.push('TransactionCompletedAt = @TransactionCompletedAt');
  }
  if (externalTxnId) {
    executor.input('ExternalTransactionID', sql.VarChar, externalTxnId);
    setClauses.push('ExternalTransactionID = @ExternalTransactionID');
  }

  try {
    const result = await executor.query(`
            UPDATE CoursePayments SET ${setClauses.join(', ')}
            OUTPUT Inserted.*
            WHERE PaymentID = @PaymentID;
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error(`Error updating payment status for ${paymentId}:`, error);
    throw error;
  }
};

const findPaymentByExternalId = async (externalId, methodId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('ExternalTransactionID', sql.VarChar, externalId);
    request.input('PaymentMethodID', sql.VarChar, methodId);
    const result = await request.query(
      'SELECT * FROM CoursePayments WHERE ExternalTransactionID = @ExternalTransactionID AND PaymentMethodID = @PaymentMethodID;'
    );
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error finding payment by external ID ${externalId}:`, error);
    throw error;
  }
};

module.exports = {
  createCoursePayment,
  findPaymentByOrderId,
  updatePaymentStatus,
  findPaymentByExternalId,
  findPendingPaymentByOrderId,
};
