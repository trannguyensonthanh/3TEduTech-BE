// File: src/api/exchangeRates/exchangeRates.repository.js

const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');

/**
 * Lấy tỷ giá mới nhất cho một cặp tiền tệ.
 * @param {string} fromCurrencyId
 * @param {string} toCurrencyId
 * @returns {Promise<object|null>} - Bản ghi ExchangeRates mới nhất hoặc null.
 */
const findLatestRate = async (fromCurrencyId, toCurrencyId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('FromCurrencyID', sql.VarChar, fromCurrencyId);
    request.input('ToCurrencyID', sql.VarChar, toCurrencyId);

    const result = await request.query(`
    SELECT TOP 1 *
    FROM ExchangeRates
    WHERE FromCurrencyID = @FromCurrencyID AND ToCurrencyID = @ToCurrencyID
    ORDER BY EffectiveTimestamp DESC;
`);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(
      `Error finding latest exchange rate for ${fromCurrencyId}->${toCurrencyId}:`,
      error
    );
    throw error;
  }
};

/**
 * Tạo một bản ghi tỷ giá mới.
 * @param {object} rateData - { FromCurrencyID, ToCurrencyID, Rate, Source }
 * @returns {Promise<object>} - Bản ghi ExchangeRates vừa tạo.
 */
const createExchangeRate = async (rateData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('FromCurrencyID', sql.VarChar, rateData.FromCurrencyID);
    request.input('ToCurrencyID', sql.VarChar, rateData.ToCurrencyID);
    request.input('Rate', sql.Decimal(36, 18), rateData.Rate);
    request.input('Source', sql.NVarChar, rateData.Source); // EffectiveTimestamp dùng default GETDATE()
    const result = await request.query(`
    INSERT INTO ExchangeRates (FromCurrencyID, ToCurrencyID, Rate, Source)
    OUTPUT Inserted.*
    VALUES (@FromCurrencyID, @ToCurrencyID, @Rate, @Source);
`);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error creating exchange rate:', error);
    throw error;
  }
};

/**
 * Lấy lịch sử tỷ giá (cho Admin xem).
 * @param {object} options - { page, limit }
 * @returns {Promise<{rates: object[], total: number}>}
 */
const findExchangeRateHistory = async (options = {}) => {
  const { page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  try {
    const pool = await getConnection();
    const request = pool.request();

    const countResult = await request.query(
      'SELECT COUNT(*) as total FROM ExchangeRates'
    );
    const { total } = countResult.recordset[0];

    request.input('Limit', sql.Int, limit);
    request.input('Offset', sql.Int, offset);

    const dataResult = await request.query(`
    SELECT * FROM ExchangeRates
    ORDER BY EffectiveTimestamp DESC
    OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
`);

    return { rates: dataResult.recordset, total };
  } catch (error) {
    logger.error('Error finding exchange rate history:', error);
    throw error;
  }
};

module.exports = {
  findLatestRate,
  createExchangeRate,
  findExchangeRateHistory,
};
