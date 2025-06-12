const httpStatus = require('http-status').status;
const ApiError = require('../../core/errors/ApiError');
const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');

/**
 * Tạo promotion mới.
 * @param {object} promoData
 * @returns {Promise<object>}
 */
const createPromotion = async (promoData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('DiscountCode', sql.VarChar, promoData.DiscountCode);
    request.input('PromotionName', sql.NVarChar, promoData.PromotionName);
    request.input('Description', sql.NVarChar, promoData.Description);
    request.input('DiscountType', sql.VarChar, promoData.DiscountType);
    request.input('DiscountValue', sql.Decimal(18, 4), promoData.DiscountValue);
    request.input('MinOrderValue', sql.Decimal(18, 4), promoData.MinOrderValue);
    request.input(
      'MaxDiscountAmount',
      sql.Decimal(18, 4),
      promoData.MaxDiscountAmount
    );
    request.input('StartDate', sql.DateTime2, promoData.StartDate);
    request.input('EndDate', sql.DateTime2, promoData.EndDate);
    request.input('MaxUsageLimit', sql.Int, promoData.MaxUsageLimit);
    request.input('Status', sql.VarChar, promoData.Status);

    const result = await request.query(`
            INSERT INTO Promotions (
                DiscountCode, PromotionName, Description, DiscountType, DiscountValue,
                MinOrderValue, MaxDiscountAmount, StartDate, EndDate, MaxUsageLimit, Status
            )
            OUTPUT Inserted.*
            VALUES (
                @DiscountCode, @PromotionName, @Description, @DiscountType, @DiscountValue,
                @MinOrderValue, @MaxDiscountAmount, @StartDate, @EndDate, @MaxUsageLimit, @Status
            );
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error creating promotion:', error);
    if (error.number === 2627 || error.number === 2601) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Mã giảm giá đã tồn tại.');
    }
    throw error;
  }
};

/**
 * Tìm promotion bằng ID.
 * @param {number} promotionId
 * @returns {Promise<object|null>}
 */
const findPromotionById = async (promotionId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('PromotionID', sql.Int, promotionId);
    const result = await request.query(
      'SELECT * FROM Promotions WHERE PromotionID = @PromotionID;'
    );
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error finding promotion by ID ${promotionId}:`, error);
    throw error;
  }
};

/**
 * Tìm promotion bằng Discount Code.
 * @param {string} discountCode
 * @returns {Promise<object|null>}
 */
const findPromotionByCode = async (discountCode) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('DiscountCode', sql.VarChar, discountCode);
    const result = await request.query(
      'SELECT * FROM Promotions WHERE DiscountCode = @DiscountCode;'
    );
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error finding promotion by code ${discountCode}:`, error);
    throw error;
  }
};

/**
 * Lấy danh sách promotions (Admin).
 * @param {object} filters - { status }
 * @param {object} options - { page, limit, sortBy }
 * @returns {Promise<{promotions: object[], total: number}>}
 */
const findAllPromotions = async (filters = {}, options = {}) => {
  const { status } = filters;
  const { page = 1, limit = 10, sortBy = 'CreatedAt:desc' } = options;
  const offset = (page - 1) * limit;

  try {
    const pool = await getConnection();
    const request = pool.request();
    const whereClauses = [];
    if (status) {
      request.input('Status', sql.VarChar, status);
      whereClauses.push('Status = @Status');
    }
    const whereCondition =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const commonQuery = `FROM Promotions ${whereCondition}`;
    const countResult = await request.query(
      `SELECT COUNT(*) as total ${commonQuery}`
    );
    const { total } = countResult.recordset[0];

    const orderByClause = 'ORDER BY CreatedAt DESC';
    if (sortBy) {
      //
    }

    request.input('Limit', sql.Int, limit);
    request.input('Offset', sql.Int, offset);
    const dataResult = await request.query(
      `SELECT * ${commonQuery} ${orderByClause} OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;`
    );

    return { promotions: dataResult.recordset, total };
  } catch (error) {
    logger.error('Error finding all promotions:', error);
    throw error;
  }
};

/**
 * Cập nhật promotion bằng ID.
 * @param {number} promotionId
 * @param {object} updateData
 * @returns {Promise<object>}
 */
const updatePromotionById = async (promotionId, updateData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('PromotionID', sql.Int, promotionId);
    request.input('UpdatedAt', sql.DateTime2, new Date());

    const setClauses = ['UpdatedAt = @UpdatedAt'];
    Object.keys(updateData).forEach((key) => {
      if (
        key !== 'PromotionID' &&
        key !== 'UsageCount' &&
        key !== 'CreatedAt'
      ) {
        const value = updateData[key];
        let sqlType;

        if (['DiscountCode', 'DiscountType', 'Status'].includes(key))
          sqlType = sql.VarChar;
        else if (['PromotionName', 'Description'].includes(key))
          sqlType = sql.NVarChar;
        else if (
          ['DiscountValue', 'MinOrderValue', 'MaxDiscountAmount'].includes(key)
        )
          sqlType = sql.Decimal(18, 4);
        else if (['StartDate', 'EndDate'].includes(key))
          sqlType = sql.DateTime2;
        else if (['MaxUsageLimit'].includes(key)) sqlType = sql.Int;
        else return;

        request.input(key, sqlType, value);
        setClauses.push(`${key} = @${key}`);
      }
    });

    if (setClauses.length === 1) return null;

    const result = await request.query(`
            UPDATE Promotions SET ${setClauses.join(', ')}
            OUTPUT Inserted.*
            WHERE PromotionID = @PromotionID;
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error(`Error updating promotion ${promotionId}:`, error);
    if (error.number === 2627 || error.number === 2601) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Mã giảm giá đã tồn tại.');
    }
    throw error;
  }
};

/**
 * Tăng UsageCount cho promotion (trong transaction).
 * @param {number} promotionId
 * @param {object} transaction
 * @returns {Promise<boolean>} - True nếu tăng thành công, False nếu đã đạt giới hạn.
 */
const incrementUsageCount = async (promotionId, transaction) => {
  const request = transaction.request();
  request.input('PromotionID', sql.Int, promotionId);
  try {
    const result = await request.query(`
            UPDATE Promotions
            SET UsageCount = UsageCount + 1
            WHERE PromotionID = @PromotionID AND (MaxUsageLimit IS NULL OR UsageCount < MaxUsageLimit);
        `);
    return result.rowsAffected[0] > 0;
  } catch (error) {
    logger.error(
      `Error incrementing usage count for promotion ${promotionId}:`,
      error
    );
    throw error;
  }
};

/**
 * Cập nhật trạng thái promotion (dùng cho việc deactivate/expire).
 * @param {number} promotionId
 * @param {string} status
 * @returns {Promise<object|null>}
 */
const updatePromotionStatus = async (promotionId, status) => {
  return updatePromotionById(promotionId, { Status: status });
};

/**
 * Giảm UsageCount cho promotion (trong transaction).
 * @param {number} promotionId
 * @param {object} transaction - Transaction object từ mssql.
 * @returns {Promise<boolean>} - True nếu giảm thành công (có dòng bị ảnh hưởng).
 */
const decrementUsageCount = async (promotionId, transaction) => {
  const request = transaction.request();
  request.input('PromotionID', sql.Int, promotionId);
  try {
    const result = await request.query(`
            UPDATE Promotions
            SET UsageCount = UsageCount - 1, UpdatedAt = GETDATE()
            WHERE PromotionID = @PromotionID AND UsageCount > 0;
        `);
    return result.rowsAffected[0] > 0;
  } catch (error) {
    logger.error(
      `Error decrementing usage count for promotion ${promotionId}:`,
      error
    );
    throw error;
  }
};

/**
 * Xóa một promotion bằng ID.
 * @param {number} promotionId
 * @returns {Promise<number>} - Số dòng bị ảnh hưởng (0 hoặc 1).
 */
const deletePromotionById = async (promotionId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('PromotionID', sql.Int, promotionId);

    const result = await request.query(
      'DELETE FROM Promotions WHERE PromotionID = @PromotionID'
    );

    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error deleting promotion ${promotionId}:`, error);
    if (error.number === 547) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Không thể xóa mã giảm giá vì có ràng buộc dữ liệu khác.'
      );
    }
    throw error;
  }
};

module.exports = {
  createPromotion,
  findPromotionById,
  findPromotionByCode,
  findAllPromotions,
  updatePromotionById,
  incrementUsageCount,
  updatePromotionStatus,
  decrementUsageCount,
  deletePromotionById,
};
