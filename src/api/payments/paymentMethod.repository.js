// src/api/payments/paymentMethod.repository.js
const httpStatus = require('http-status');

const ApiError = require('../../core/errors/ApiError');
const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');

// Cache đơn giản cho payment methods vì chúng ít thay đổi
const methodsCache = {
  all: null,
  byId: new Map(),
  expires: 0,
};
const CACHE_TTL = 15 * 60 * 1000; // Cache 15 phút

/**
 * Tải tất cả các payment methods vào cache nếu cache hết hạn hoặc chưa có.
 * @param {boolean} forceRefresh - Bỏ qua cache và tải lại từ DB.
 */
const loadAllMethodsToCache = async (forceRefresh = false) => {
  const now = Date.now();
  if (!forceRefresh && methodsCache.all && methodsCache.expires > now) {
    return; // Cache còn hạn
  }

  logger.debug('Refreshing PaymentMethods cache...');
  try {
    const pool = await getConnection();
    const result = await pool
      .request()
      .query(
        'SELECT MethodID, MethodName FROM PaymentMethods ORDER BY MethodName;'
      ); // Lấy các cột cần thiết
    const allMethods = result.recordset;

    // Cập nhật cache
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
    // Không xóa cache cũ nếu lỗi, để tránh mất dữ liệu khi DB tạm thời lỗi
    // throw error; // Không nên throw lỗi ở hàm cache
  }
};

/**
 * Tìm một payment method bằng MethodID (sử dụng cache).
 * @param {string} methodId
 * @returns {Promise<object|null>} - Object PaymentMethod hoặc null nếu không tìm thấy.
 */
const findMethodById = async (methodId) => {
  await loadAllMethodsToCache(); // Đảm bảo cache được tải (nếu cần)
  const cachedMethod = methodsCache.byId.get(methodId);
  // Trả về bản sao để tránh sửa đổi cache gốc (nếu cần)
  return cachedMethod ? { ...cachedMethod } : null;
};

/**
 * Lấy tất cả các payment methods (sử dụng cache).
 * @returns {Promise<Array<object>>} - Mảng các PaymentMethod.
 */
const findAllMethods = async () => {
  await loadAllMethodsToCache(); // Đảm bảo cache được tải
  // Trả về bản sao của mảng
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

    const result = await request.query(`
            INSERT INTO PaymentMethods (MethodID, MethodName)
            OUTPUT Inserted.*
            VALUES (@MethodID, @MethodName);
        `);
    await loadAllMethodsToCache(true); // Force refresh cache sau khi tạo mới
    return result.recordset[0];
  } catch (error) {
    logger.error('Error creating payment method:', error);
    if (error.number === 2627 || error.number === 2601) {
      // Unique MethodID
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
    // Thêm các trường khác nếu bảng PaymentMethods có thêm cột

    if (setClauses.length === 0) return null;

    const result = await request.query(`
            UPDATE PaymentMethods SET ${setClauses.join(', ')}
            OUTPUT Inserted.*
            WHERE MethodID = @MethodID;
        `);
    await loadAllMethodsToCache(true); // Force refresh cache
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
    // Cần kiểm tra xem có InstructorPayoutMethods hoặc CoursePayments nào đang dùng không?
    // Hoặc dựa vào FK constraint (nếu là RESTRICT hoặc NO ACTION)
    const result = await request.query(
      'DELETE FROM PaymentMethods WHERE MethodID = @MethodID'
    );
    if (result.rowsAffected[0] > 0) {
      await loadAllMethodsToCache(true); // Force refresh cache
    }
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error deleting payment method ${methodId}:`, error);
    if (error.number === 547) {
      // FK Constraint
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
  // Admin functions (nếu cần API riêng cho chúng)
  createMethod,
  updateMethodById,
  deleteMethodById,
};
