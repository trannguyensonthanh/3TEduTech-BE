const httpStatus = require('http-status').status;

const ApiError = require('../../core/errors/ApiError');
const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');

const methodsCache = {
  all: null,
  byId: new Map(),
  expires: 0,
};
const CACHE_TTL = 15 * 60 * 1000;

/**
 * Tải tất cả các payment methods vào cache nếu cache hết hạn hoặc chưa có.
 * @param {boolean} forceRefresh - Bỏ qua cache và tải lại từ DB.
 */
const loadAllMethodsToCache = async (forceRefresh = false) => {
  const now = Date.now();
  if (!forceRefresh && methodsCache.all && methodsCache.expires > now) {
    return;
  }

  logger.debug('Refreshing PaymentMethods cache...');
  try {
    const pool = await getConnection();
    const result = await pool
      .request()
      .query(
        'SELECT MethodID, MethodName FROM PaymentMethods ORDER BY MethodName;'
      );
    const allMethods = result.recordset;

    methodsCache.all = allMethods;
    methodsCache.byId.clear();
    allMethods.forEach((method) => {
      methodsCache.byId.set(method.MethodID, method);
    });
    methodsCache.expires = now + CACHE_TTL;
    logger.info(
      `PaymentMethods cache refreshed with ${allMethods.length} methods.`
    );
  } catch (error) {
    logger.error('Error loading PaymentMethods into cache:', error);
  }
};

/**
 * Tìm một payment method bằng MethodID (sử dụng cache).
 * @param {string} methodId
 * @returns {Promise<object|null>} - Object PaymentMethod hoặc null nếu không tìm thấy.
 */
const findMethodById = async (methodId) => {
  await loadAllMethodsToCache();
  const cachedMethod = methodsCache.byId.get(methodId);
  return cachedMethod ? { ...cachedMethod } : null;
};

/**
 * Lấy tất cả các payment methods (sử dụng cache).
 * @returns {Promise<Array<object>>} - Mảng các PaymentMethod.
 */
const findAllMethods = async () => {
  await loadAllMethodsToCache();
  return methodsCache.all ? [...methodsCache.all] : [];
};

/**
 * Tạo payment method mới (chỉ dùng cho Admin hoặc seeding).
 * @param {object} methodData - { MethodID, MethodName }
 * @returns {Promise<object>}
 */
const createMethod = async (methodData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('MethodID', sql.VarChar, methodData.MethodID);
    request.input('MethodName', sql.NVarChar, methodData.MethodName);
    request.input('IconUrl', sql.VarChar, methodData.IconUrl);
    request.input('Description', sql.NVarChar, methodData.Description);
    const result = await request.query(`
            INSERT INTO PaymentMethods (MethodID, MethodName, IconUrl, Description)
            OUTPUT Inserted.*
            VALUES (@MethodID, @MethodName, @IconUrl, @Description);
        `);
    await loadAllMethodsToCache(true);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error creating payment method:', error);
    if (error.number === 2627 || error.number === 2601) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Mã phương thức thanh toán đã tồn tại.'
      );
    }
    throw error;
  }
};

/**
 * Cập nhật payment method (Admin).
 * @param {string} methodId
 * @param {object} updateData - { MethodName }
 * @returns {Promise<object|null>}
 */
const updateMethodById = async (methodId, updateData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('MethodID', sql.VarChar, methodId);

    const setClauses = [];
    if (updateData.MethodName !== undefined) {
      request.input('MethodName', sql.NVarChar, updateData.MethodName);
      setClauses.push('MethodName = @MethodName');
    }
    if (updateData.IconUrl !== undefined) {
      request.input('IconUrl', sql.VarChar, updateData.IconUrl);
      setClauses.push('IconUrl = @IconUrl');
    }
    if (updateData.Description !== undefined) {
      request.input('Description', sql.NVarChar, updateData.Description);
      setClauses.push('Description = @Description');
    }

    if (setClauses.length === 0) return null;

    const result = await request.query(`
            UPDATE PaymentMethods SET ${setClauses.join(', ')}
            OUTPUT Inserted.*
            WHERE MethodID = @MethodID;
        `);
    await loadAllMethodsToCache(true);
    return result.recordset[0];
  } catch (error) {
    logger.error(`Error updating payment method ${methodId}:`, error);
    throw error;
  }
};

/**
 * Xóa payment method (Admin - Cẩn thận!).
 * @param {string} methodId
 * @returns {Promise<number>}
 */
const deleteMethodById = async (methodId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('MethodID', sql.VarChar, methodId);
    const result = await request.query(
      'DELETE FROM PaymentMethods WHERE MethodID = @MethodID'
    );
    if (result.rowsAffected[0] > 0) {
      await loadAllMethodsToCache(true);
    }
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error deleting payment method ${methodId}:`, error);
    if (error.number === 547) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Không thể xóa phương thức thanh toán vì đang được sử dụng.'
      );
    }
    throw error;
  }
};

module.exports = {
  findMethodById,
  findAllMethods,
  createMethod,
  updateMethodById,
  deleteMethodById,
};
