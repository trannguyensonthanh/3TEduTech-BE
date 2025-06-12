// File: src/api/currencies/currencies.repository.js
const httpStatus = require('http-status').status;
const ApiError = require('../../core/errors/ApiError');
const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');

/**
 * Tạo mới một bản ghi tiền tệ.
 * @param {Object} currencyData
 * @returns {Promise<Object>}
 */
const createCurrency = async (currencyData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CurrencyID', sql.VarChar, currencyData.CurrencyID);
    request.input('CurrencyName', sql.NVarChar, currencyData.CurrencyName);
    request.input('Type', sql.VarChar, currencyData.Type);
    request.input('DecimalPlaces', sql.TinyInt, currencyData.DecimalPlaces);

    const result = await request.query(`
        INSERT INTO Currencies (CurrencyID, CurrencyName, Type, DecimalPlaces)
        OUTPUT Inserted.*
        VALUES (@CurrencyID, @CurrencyName, @Type, @DecimalPlaces);
    `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error in createCurrency repository:', error);
    if (error.number === 2627) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Mã tiền tệ '${currencyData.CurrencyID}' đã tồn tại.`
      );
    }
    throw error;
  }
};

/**
 * Tìm tiền tệ theo mã.
 * @param {string} currencyId
 * @returns {Promise<Object|null>}
 */
const findCurrencyById = async (currencyId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CurrencyID', sql.VarChar, currencyId);
    const result = await request.query(
      'SELECT * FROM Currencies WHERE CurrencyID = @CurrencyID'
    );
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error in findCurrencyById (${currencyId}):`, error);
    throw error;
  }
};

/**
 * Tìm tiền tệ theo tên.
 * @param {string} currencyName
 * @returns {Promise<Object|null>}
 */
const findCurrencyByName = async (currencyName) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CurrencyName', sql.NVarChar, currencyName);
    const result = await request.query(
      'SELECT * FROM Currencies WHERE CurrencyName = @CurrencyName'
    );
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error in findCurrencyByName (${currencyName}):`, error);
    throw error;
  }
};

/**
 * Lấy danh sách tiền tệ với phân trang và tìm kiếm.
 * @param {Object} options
 * @returns {Promise<{currencies: Array, total: number}>}
 */
const findAllCurrencies = async (options = {}) => {
  const { page = 1, limit = 10, searchTerm = '' } = options;
  const offset = (page - 1) * limit;

  try {
    const pool = await getConnection();
    const request = pool.request();

    const whereClauses = [];
    if (searchTerm) {
      request.input('SearchTerm', sql.NVarChar, `%${searchTerm}%`);
      whereClauses.push(
        '(CurrencyID LIKE @SearchTerm OR CurrencyName LIKE @SearchTerm)'
      );
    }

    const whereCondition =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const commonQuery = `FROM Currencies ${whereCondition}`;

    const countResult = await request.query(
      `SELECT COUNT(*) as total ${commonQuery}`
    );
    const { total } = countResult.recordset[0];

    request.input('Limit', sql.Int, limit);
    request.input('Offset', sql.Int, offset);
    const dataResult = await request.query(`
    SELECT * ${commonQuery}
    ORDER BY CurrencyName ASC
    OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
`);

    return { currencies: dataResult.recordset, total };
  } catch (error) {
    logger.error('Error in findAllCurrencies repository:', error);
    throw error;
  }
};

/**
 * Cập nhật thông tin tiền tệ theo mã.
 * @param {string} currencyId
 * @param {Object} updateData
 * @returns {Promise<Object|null>}
 */
const updateCurrencyById = async (currencyId, updateData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CurrencyID', sql.VarChar, currencyId);

    const setClauses = [];
    if (updateData.CurrencyName !== undefined) {
      request.input('CurrencyName', sql.NVarChar, updateData.CurrencyName);
      setClauses.push('CurrencyName = @CurrencyName');
    }
    if (updateData.Type !== undefined) {
      request.input('Type', sql.VarChar, updateData.Type);
      setClauses.push('Type = @Type');
    }
    if (updateData.DecimalPlaces !== undefined) {
      request.input('DecimalPlaces', sql.TinyInt, updateData.DecimalPlaces);
      setClauses.push('DecimalPlaces = @DecimalPlaces');
    }

    if (setClauses.length === 0) return null;

    const result = await request.query(`
    UPDATE Currencies
    SET ${setClauses.join(', ')}
    OUTPUT Inserted.*
    WHERE CurrencyID = @CurrencyID;
`);
    return result.recordset[0];
  } catch (error) {
    logger.error(`Error updating currency ${currencyId}:`, error);
    throw error;
  }
};

/**
 * Kiểm tra tiền tệ có đang được sử dụng không.
 * @param {string} currencyId
 * @returns {Promise<boolean>}
 */
const isCurrencyInUse = async (currencyId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CurrencyID', sql.VarChar, currencyId);
    const checkQuery = `
    SELECT TOP 1 1 FROM CoursePayments WHERE OriginalCurrencyID = @CurrencyID OR ConvertedCurrencyID = @CurrencyID
    UNION ALL
    SELECT TOP 1 1 FROM ExchangeRates WHERE FromCurrencyID = @CurrencyID OR ToCurrencyID = @CurrencyID
    UNION ALL
    SELECT TOP 1 1 FROM InstructorBalanceTransactions WHERE CurrencyID = @CurrencyID
    UNION ALL
    SELECT TOP 1 1 FROM Payouts WHERE CurrencyID = @CurrencyID OR ActualCurrencyID = @CurrencyID
    UNION ALL
    SELECT TOP 1 1 FROM WithdrawalRequests WHERE RequestedCurrencyID = @CurrencyID
`;
    const result = await request.query(checkQuery);
    return result.recordset.length > 0;
  } catch (error) {
    logger.error(`Error checking if currency ${currencyId} is in use:`, error);
    throw error;
  }
};

/**
 * Xóa tiền tệ theo mã.
 * @param {string} currencyId
 * @returns {Promise<number>}
 */
const deleteCurrencyById = async (currencyId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CurrencyID', sql.VarChar, currencyId);
    const result = await request.query(
      'DELETE FROM Currencies WHERE CurrencyID = @CurrencyID'
    );
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error deleting currency ${currencyId}:`, error);
    if (error.number === 547) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Không thể xóa tiền tệ vì đang được sử dụng.'
      );
    }
    throw error;
  }
};

module.exports = {
  createCurrency,
  findCurrencyById,
  findCurrencyByName,
  findAllCurrencies,
  updateCurrencyById,
  isCurrencyInUse,
  deleteCurrencyById,
};
