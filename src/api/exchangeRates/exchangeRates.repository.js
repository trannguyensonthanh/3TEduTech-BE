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
 * @param {object} rateData - { FromCurrencyID, ToCurrencyID, Rate, Source, EffectiveTimestamp }
 * @returns {Promise<object>} - Bản ghi ExchangeRates vừa tạo.
 */
const createExchangeRate = async (rateData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('FromCurrencyID', sql.VarChar, rateData.FromCurrencyID);
    request.input('ToCurrencyID', sql.VarChar, rateData.ToCurrencyID);
    request.input('Rate', sql.Decimal(18, 9), rateData.Rate);
    request.input('Source', sql.NVarChar, rateData.Source);
    request.input(
      'EffectiveTimestamp',
      sql.DateTime2,
      rateData.EffectiveTimestamp || new Date()
    );

    const result = await request.query(`
    INSERT INTO ExchangeRates (FromCurrencyID, ToCurrencyID, Rate, Source, EffectiveTimestamp)
    OUTPUT Inserted.*
    VALUES (@FromCurrencyID, @ToCurrencyID, @Rate, @Source, @EffectiveTimestamp);
`);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error creating exchange rate:', error);
    throw error;
  }
};

/**
 * Lấy lịch sử tỷ giá (có filter và phân trang).
 */
const findExchangeRateHistory = async (options = {}) => {
  const { page = 1, limit = 20, fromCurrency, toCurrency } = options;
  const offset = (page - 1) * limit;

  try {
    const pool = await getConnection();
    const request = pool.request();

    const whereClauses = [];
    if (fromCurrency) {
      request.input('FromCurrencyFilter', sql.VarChar, fromCurrency);
      whereClauses.push('FromCurrencyID = @FromCurrencyFilter');
    }
    if (toCurrency) {
      request.input('ToCurrencyFilter', sql.VarChar, toCurrency);
      whereClauses.push('ToCurrencyID = @ToCurrencyFilter');
    }

    const whereCondition =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const commonQuery = `FROM ExchangeRates ${whereCondition}`;

    const countResult = await request.query(
      `SELECT COUNT(*) as total ${commonQuery}`
    );
    const { total } = countResult.recordset[0];

    request.input('Limit', sql.Int, limit);
    request.input('Offset', sql.Int, offset);

    const dataResult = await request.query(`
        SELECT * ${commonQuery}
        ORDER BY EffectiveTimestamp DESC
        OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
    `);

    return { rates: dataResult.recordset, total };
  } catch (error) {
    logger.error('Error finding exchange rate history:', error);
    throw error;
  }
};

/**
 * Tìm tỷ giá bằng ID.
 */
const findRateById = async (rateId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('RateID', sql.BigInt, rateId);
    const result = await request.query(
      'SELECT * FROM ExchangeRates WHERE RateID = @RateID'
    );
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error finding exchange rate by ID ${rateId}:`, error);
    throw error;
  }
};

/**
 * Cập nhật một bản ghi tỷ giá.
 */
const updateExchangeRate = async (rateId, updateData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('RateID', sql.BigInt, rateId);

    const setClauses = [];
    if (updateData.Rate !== undefined) {
      request.input('Rate', sql.Decimal(36, 18), updateData.Rate);
      setClauses.push('Rate = @Rate');
    }
    if (updateData.EffectiveTimestamp !== undefined) {
      request.input(
        'EffectiveTimestamp',
        sql.DateTime2,
        new Date(updateData.EffectiveTimestamp)
      );
      setClauses.push('EffectiveTimestamp = @EffectiveTimestamp');
    }
    if (updateData.Source !== undefined) {
      request.input('Source', sql.NVarChar, updateData.Source);
      setClauses.push('Source = @Source');
    }

    if (setClauses.length === 0) return null;

    const result = await request.query(`
            UPDATE ExchangeRates SET ${setClauses.join(', ')}
            OUTPUT Inserted.*
            WHERE RateID = @RateID;
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error(`Error updating exchange rate ${rateId}:`, error);
    throw error;
  }
};

/**
 * Xóa một bản ghi tỷ giá.
 */
const deleteExchangeRate = async (rateId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('RateID', sql.BigInt, rateId);
    const result = await request.query(
      'DELETE FROM ExchangeRates WHERE RateID = @RateID'
    );
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error deleting exchange rate ${rateId}:`, error);
    throw error;
  }
};

module.exports = {
  findLatestRate,
  createExchangeRate,
  findExchangeRateHistory,
  findRateById,
  updateExchangeRate,
  deleteExchangeRate,
};
