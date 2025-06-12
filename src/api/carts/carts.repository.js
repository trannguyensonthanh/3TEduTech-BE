// file: src/api/carts/carts.repository.js

const httpStatus = require('http-status').status;
const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');
const ApiError = require('../../core/errors/ApiError');
/**
 * Tìm hoặc tạo giỏ hàng cho một tài khoản.
 * @param {number} accountId
 * @param {object} [transaction=null]
 * @returns {Promise<object>} - Bản ghi Cart.
 */
const findOrCreateCart = async (accountId, transaction = null) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('AccountID', sql.BigInt, accountId);
  try {
    let result = await executor.query(
      'SELECT * FROM Carts WHERE AccountID = @AccountID;'
    );
    if (result.recordset[0]) {
      return result.recordset[0];
    }
    const createExecutor = transaction
      ? transaction.request()
      : (await getConnection()).request();
    createExecutor.input('AccountID', sql.BigInt, accountId);
    result = await createExecutor.query(`
                INSERT INTO Carts (AccountID) OUTPUT Inserted.* VALUES (@AccountID);
            `);
    if (result.recordset[0]) {
      return result.recordset[0];
    }
    throw new Error('Failed to create cart.');
  } catch (error) {
    if (error.number === 2627 || error.number === 2601) {
      logger.warn(
        `Race condition detected during findOrCreateCart for Account=${accountId}. Retrying find.`
      );
      const retryExecutor = transaction
        ? transaction.request()
        : (await getConnection()).request();
      retryExecutor.input('AccountID', sql.BigInt, accountId);
      const retryResult = await retryExecutor.query(
        'SELECT * FROM Carts WHERE AccountID = @AccountID;'
      );
      if (retryResult.recordset[0]) return retryResult.recordset[0];
      throw error;
    }
    logger.error(`Error in findOrCreateCart for account ${accountId}:`, error);
    throw error;
  }
};

/**
 * Thêm item vào giỏ hàng.
 * @param {object} itemData - { CartID, CourseID, PriceAtAddition }
 * @param {object} [transaction=null]
 * @returns {Promise<object>} - CartItem vừa thêm.
 */
const addCartItem = async (itemData, transaction = null) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('CartID', sql.BigInt, itemData.CartID);
  executor.input('CourseID', sql.BigInt, itemData.CourseID);
  executor.input(
    'PriceAtAddition',
    sql.Decimal(18, 4),
    itemData.PriceAtAddition
  );
  try {
    const result = await executor.query(`
            INSERT INTO CartItems (CartID, CourseID, PriceAtAddition)
            OUTPUT Inserted.*
            VALUES (@CartID, @CourseID, @PriceAtAddition);
        `);
    return result.recordset[0];
  } catch (error) {
    if (error.number === 2627 || error.number === 2601) {
      logger.warn(
        `Attempt to add duplicate course ${itemData.CourseID} to cart ${itemData.CartID}`
      );
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Khóa học này đã có trong giỏ hàng.'
      );
    }
    logger.error('Error adding cart item:', error);
    throw error;
  }
};

/**
 * Tìm một item trong giỏ hàng bằng CartID và CourseID.
 * @param {number} cartId
 * @param {number} courseId
 * @returns {Promise<object|null>}
 */
const findCartItemByCourse = async (cartId, courseId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CartID', sql.BigInt, cartId);
    request.input('CourseID', sql.BigInt, courseId);
    const result = await request.query(`
            SELECT * FROM CartItems WHERE CartID = @CartID AND CourseID = @CourseID;
        `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(
      `Error finding cart item for cart ${cartId}, course ${courseId}:`,
      error
    );
    throw error;
  }
};

/**
 * Xóa item khỏi giỏ hàng.
 * @param {number} cartItemId
 * @param {object} [transaction=null]
 * @returns {Promise<number>} - Số dòng bị ảnh hưởng.
 */
const removeCartItemById = async (cartItemId, transaction = null) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('CartItemID', sql.BigInt, cartItemId);
  try {
    const result = await executor.query(
      'DELETE FROM CartItems WHERE CartItemID = @CartItemID'
    );
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error removing cart item ${cartItemId}:`, error);
    throw error;
  }
};

/**
 * Xóa item khỏi giỏ hàng dựa trên CartID và CourseID.
 * @param {number} cartId
 * @param {number} courseId
 * @param {object} [transaction=null]
 * @returns {Promise<number>} - Số dòng bị ảnh hưởng.
 */
const removeCartItemByCourse = async (cartId, courseId, transaction = null) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('CartID', sql.BigInt, cartId);
  executor.input('CourseID', sql.BigInt, courseId);
  try {
    const result = await executor.query(
      'DELETE FROM CartItems WHERE CartID = @CartID AND CourseID = @CourseID'
    );
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(
      `Error removing course ${courseId} from cart ${cartId}:`,
      error
    );
    throw error;
  }
};

/**
 * Lấy tất cả items trong giỏ hàng, join với thông tin khóa học.
 * @param {number} cartId
 * @returns {Promise<object[]>} - Mảng các cart items kèm thông tin course.
 */
const findCartItemsByCartId = async (cartId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CartID', sql.BigInt, cartId);
    const result = await request.query(`
            SELECT
                ci.CartItemID, ci.CourseID, ci.PriceAtAddition, ci.AddedAt,
                c.CourseName, c.Slug, c.ThumbnailUrl, c.OriginalPrice, c.DiscountedPrice,
                up.FullName as InstructorName
            FROM CartItems ci
            JOIN Courses c ON ci.CourseID = c.CourseID
            JOIN UserProfiles up ON c.InstructorID = up.AccountID
            WHERE ci.CartID = @CartID
            ORDER BY ci.AddedAt DESC;
        `);
    return result.recordset;
  } catch (error) {
    logger.error(`Error finding items for cart ${cartId}:`, error);
    throw error;
  }
};

/**
 * Xóa tất cả items khỏi giỏ hàng (thường dùng sau khi tạo đơn hàng).
 * @param {number} cartId
 * @param {object} [transaction=null]
 * @returns {Promise<number>} - Số dòng bị ảnh hưởng.
 */
const clearCart = async (cartId, transaction = null) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('CartID', sql.BigInt, cartId);
  try {
    const result = await executor.query(
      'DELETE FROM CartItems WHERE CartID = @CartID'
    );
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error clearing cart ${cartId}:`, error);
    throw error;
  }
};

module.exports = {
  findOrCreateCart,
  addCartItem,
  findCartItemByCourse,
  removeCartItemById,
  removeCartItemByCourse,
  findCartItemsByCartId,
  clearCart,
};
