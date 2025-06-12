const httpStatus = require('http-status').status;
const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');
const ApiError = require('../../core/errors/ApiError');

const createLanguage = async (langData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('LanguageCode', sql.VarChar, langData.LanguageCode);
    request.input('LanguageName', sql.NVarChar, langData.LanguageName);
    request.input('NativeName', sql.NVarChar, langData.NativeName);
    request.input(
      'IsActive',
      sql.Bit,
      langData.IsActive === undefined ? 1 : langData.IsActive
    );
    request.input('DisplayOrder', sql.Int, langData.DisplayOrder);

    const result = await request.query(`
            INSERT INTO Languages (LanguageCode, LanguageName, NativeName, IsActive, DisplayOrder)
            OUTPUT Inserted.*
            VALUES (@LanguageCode, @LanguageName, @NativeName, @IsActive, @DisplayOrder);
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error creating language:', error);
    if (error.number === 2627) {
      if (error.message.includes('PK_Languages')) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Mã ngôn ngữ '${langData.LanguageCode}' đã tồn tại.`
        );
      }
      if (error.message.includes('UQ_Languages_LanguageName')) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Tên ngôn ngữ '${langData.LanguageName}' đã tồn tại.`
        );
      }
    }
    throw error;
  }
};

const findLanguageByCode = async (languageCode) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('LanguageCode', sql.VarChar, languageCode);
    const result = await request.query(
      'SELECT * FROM Languages WHERE LanguageCode = @LanguageCode;'
    );
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error finding language by code ${languageCode}:`, error);
    throw error;
  }
};

/**
 * Lấy danh sách ngôn ngữ (có phân trang và filter theo isActive).
 * @param {object} options - { isActive (boolean | null), page, limit, sortBy }
 * @returns {Promise<{languages: Array<object>, total: number}>}
 */
const findAllLanguages = async (options = {}) => {
  const {
    isActive = null,
    page = 1,
    limit = 0,
    sortBy = 'DisplayOrder:asc',
  } = options;
  const offset = (page - 1) * limit;

  try {
    const pool = await getConnection();
    const request = pool.request();

    let baseQuery = 'FROM Languages';
    const whereClauses = [];

    if (isActive !== null) {
      request.input('IsActive', sql.Bit, isActive);
      whereClauses.push('IsActive = @IsActive');
    }

    const whereCondition =
      whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';
    baseQuery += whereCondition;

    const countResult = await request.query(
      `SELECT COUNT(*) as total ${baseQuery}`
    );
    const { total } = countResult.recordset[0];

    let orderByClause = 'ORDER BY DisplayOrder ASC, LanguageName ASC';
    if (sortBy) {
      const [field, order] = sortBy.split(':');
      const orderDirection = order?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
      const allowedSortFields = {
        DisplayOrder: 'DisplayOrder',
        LanguageName: 'LanguageName',
        LanguageCode: 'LanguageCode',
        CreatedAt: 'CreatedAt',
      };
      if (allowedSortFields[field]) {
        orderByClause = `ORDER BY ${allowedSortFields[field]} ${orderDirection}, LanguageCode ASC`;
      }
    }

    let dataQuery = `SELECT * ${baseQuery} ${orderByClause}`;
    if (limit > 0) {
      request.input('Limit', sql.Int, limit);
      request.input('Offset', sql.Int, offset);
      dataQuery += ' OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY';
    }

    const result = await request.query(dataQuery);
    return { languages: result.recordset, total };
  } catch (error) {
    logger.error('Error finding all languages:', error);
    throw error;
  }
};

const updateLanguage = async (languageCode, updateData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('LanguageCode', sql.VarChar, languageCode);
    request.input('UpdatedAt', sql.DateTime2, new Date());

    const setClauses = ['UpdatedAt = @UpdatedAt'];
    if (updateData.LanguageName !== undefined) {
      request.input('LanguageName', sql.NVarChar, updateData.LanguageName);
      setClauses.push('LanguageName = @LanguageName');
    }
    if (updateData.NativeName !== undefined) {
      request.input('NativeName', sql.NVarChar, updateData.NativeName);
      setClauses.push('NativeName = @NativeName');
    }
    if (updateData.IsActive !== undefined) {
      request.input('IsActive', sql.Bit, updateData.IsActive);
      setClauses.push('IsActive = @IsActive');
    }
    if (updateData.DisplayOrder !== undefined) {
      request.input('DisplayOrder', sql.Int, updateData.DisplayOrder);
      setClauses.push('DisplayOrder = @DisplayOrder');
    }

    if (setClauses.length === 1) return null;

    const result = await request.query(`
            UPDATE Languages SET ${setClauses.join(', ')}
            OUTPUT Inserted.*
            WHERE LanguageCode = @LanguageCode;
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error(`Error updating language ${languageCode}:`, error);
    if (
      error.number === 2627 &&
      error.message.includes('UQ_Languages_LanguageName')
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Tên ngôn ngữ '${updateData.LanguageName}' đã tồn tại.`
      );
    }
    throw error;
  }
};

const deleteLanguage = async (languageCode) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('LanguageCode', sql.VarChar, languageCode);
    const result = await request.query(
      'DELETE FROM Languages WHERE LanguageCode = @LanguageCode;'
    );
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error deleting language ${languageCode}:`, error);
    if (error.number === 547) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Không thể xóa ngôn ngữ vì đang được sử dụng bởi khóa học hoặc phụ đề.'
      );
    }
    throw error;
  }
};

module.exports = {
  createLanguage,
  findLanguageByCode,
  findAllLanguages,
  updateLanguage,
  deleteLanguage,
};
