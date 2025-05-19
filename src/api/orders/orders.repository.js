const httpStatus = require('http-status').status;
const { log } = require('winston');
const ApiError = require('../../core/errors/ApiError');
const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');

/**
 * Tạo bản ghi Order mới (trong transaction).
 * @param {object} orderData - { AccountID, OriginalTotalPrice, DiscountAmount, FinalAmount, PromotionID, OrderStatus }
 * @param {object} transaction
 * @returns {Promise<object>} - Order vừa tạo.
 */
const createOrder = async (orderData, transaction) => {
  const request = transaction.request();

  request.input('AccountID', sql.BigInt, orderData.AccountID);
  request.input(
    'OriginalTotalPrice',
    sql.Decimal(18, 4),
    orderData.OriginalTotalPrice
  );
  request.input(
    'DiscountAmount',
    sql.Decimal(18, 4),
    orderData.DiscountAmount || 0
  );
  request.input('FinalAmount', sql.Decimal(18, 4), orderData.FinalAmount);
  request.input('PromotionID', sql.Int, orderData.PromotionID); // Có thể NULL
  request.input('OrderStatus', sql.VarChar, orderData.OrderStatus); // Thường là PENDING_PAYMENT
  // OrderDate dùng default GETDATE()

  try {
    const result = await request.query(`
            INSERT INTO Orders (AccountID, OriginalTotalPrice, DiscountAmount, FinalAmount, PromotionID, OrderStatus)
            OUTPUT Inserted.*
            VALUES (@AccountID, @OriginalTotalPrice, @DiscountAmount, @FinalAmount, @PromotionID, @OrderStatus);
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error creating order:', error);
    throw error;
  }
};

/**
 * Tạo các bản ghi OrderItem mới cho một Order (trong transaction).
 * @param {number} orderId
 * @param {Array<object>} itemsData - Mảng các object { CourseID, PriceAtOrder }
 * @param {object} transaction
 * @returns {Promise<Array<object>>} - Mảng các OrderItem vừa tạo.
 */
const createOrderItems = async (orderId, itemsData, transaction) => {
  const insertedItems = [];
  for (const item of itemsData) {
    const request = transaction.request();
    request.input('OrderID', sql.BigInt, orderId);
    request.input('CourseID', sql.BigInt, item.CourseID);
    request.input('PriceAtOrder', sql.Decimal(18, 4), item.PriceAtOrder);

    const result = await request.query(`
      INSERT INTO OrderItems (OrderID, CourseID, PriceAtOrder)
      OUTPUT Inserted.*
      VALUES (@OrderID, @CourseID, @PriceAtOrder);
    `);

    if (result.recordset[0]) {
      insertedItems.push(result.recordset[0]);
    } else {
      throw new Error(
        `Failed to create order item for course ${item.CourseID}`
      );
    }
  }
  return insertedItems;
};

/**
 * Cập nhật trạng thái đơn hàng và liên kết PaymentID.
 * @param {number} orderId
 * @param {object} updateData - { OrderStatus, PaymentID }
 * @param {object} [transaction=null]
 * @returns {Promise<object>} - Order đã cập nhật.
 */
const updateOrderStatusAndPayment = async (
  orderId,
  updateData,
  transaction = null
) => {
  logger.debug('Update data:', updateData);
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('OrderID', sql.BigInt, orderId);

  const setClauses = [];

  if (updateData.OrderStatus) {
    executor.input('OrderStatus', sql.VarChar, updateData.OrderStatus);
    setClauses.push('OrderStatus = @OrderStatus');
  }
  if (updateData.PaymentID) {
    executor.input('PaymentID', sql.BigInt, updateData.PaymentID);
    setClauses.push('PaymentID = @PaymentID');
  }

  if (setClauses.length === 0) return null; // Không có gì cập nhật

  try {
    const result = await executor.query(`
            UPDATE Orders
            SET ${setClauses.join(', ')}
            OUTPUT Inserted.*
            WHERE OrderID = @OrderID;
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error(`Error updating order status/payment for ${orderId}:`, error);
    // Xử lý lỗi unique PaymentID nếu cần
    if (error.number === 2627 || error.number === 2601) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Lỗi khi liên kết thanh toán với đơn hàng (trùng lặp).'
      );
    }
    throw error;
  }
};

/**
 * Cập nhật EnrollmentID cho một OrderItem (trong transaction).
 * @param {number} orderItemId
 * @param {number} enrollmentId
 * @param {object} transaction
 * @returns {Promise<void>}
 */
const linkOrderItemToEnrollment = async (
  orderItemId,
  enrollmentId,
  transaction
) => {
  const request = transaction.request();
  request.input('OrderItemID', sql.BigInt, orderItemId);
  request.input('EnrollmentID', sql.BigInt, enrollmentId);
  try {
    await request.query(`
               UPDATE OrderItems SET EnrollmentID = @EnrollmentID WHERE OrderItemID = @OrderItemID;
          `);
  } catch (error) {
    logger.error(
      `Error linking order item ${orderItemId} to enrollment ${enrollmentId}:`,
      error
    );
    if (error.number === 2627 || error.number === 2601) {
      // Lỗi unique EnrollmentID
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Lỗi khi liên kết đơn hàng với đăng ký (trùng lặp Enrollment).'
      );
    }
    throw error;
  }
};

/**
 * Tìm đơn hàng bằng ID, bao gồm các items và thông tin course.
 * @param {number} orderId
 * @returns {Promise<object|null>} - Order object với mảng items.
 */
const findOrderByIdWithDetails = async (orderId) => {
  try {
    const pool = await getConnection();
    // Lấy thông tin Order cơ bản
    const orderRequest = pool.request();
    orderRequest.input('OrderID', sql.BigInt, orderId);
    const orderResult = await orderRequest.query(`
             SELECT o.*, p.PaymentStatusID, pm.MethodName as PaymentMethodName
             FROM Orders o
             LEFT JOIN CoursePayments p ON o.PaymentID = p.PaymentID
             LEFT JOIN PaymentMethods pm ON p.PaymentMethodID = pm.MethodID
             WHERE o.OrderID = @OrderID;
        `);
    const order = orderResult.recordset[0];
    if (!order) return null;

    // Lấy Order Items và thông tin Course
    const itemsRequest = pool.request();
    itemsRequest.input('OrderID', sql.BigInt, orderId);
    const itemsResult = await itemsRequest.query(`
            SELECT
                oi.OrderItemID, oi.CourseID, oi.PriceAtOrder, oi.EnrollmentID,
                c.CourseName, c.Slug, c.ThumbnailUrl,
                up.FullName as InstructorName
            FROM OrderItems oi
            JOIN Courses c ON oi.CourseID = c.CourseID
            JOIN UserProfiles up ON c.InstructorID = up.AccountID
            WHERE oi.OrderID = @OrderID;
        `);
    order.items = itemsResult.recordset;

    return order;
  } catch (error) {
    logger.error(`Error finding order details for ${orderId}:`, error);
    throw error;
  }
};

/**
 * Lấy danh sách đơn hàng của một người dùng.
 * @param {number} accountId
 * @param {object} options - { page, limit, status }
 * @returns {Promise<{orders: object[], total: number}>}
 */
const findOrdersByAccountId = async (accountId, options = {}) => {
  const { page = 1, limit = 10, status = '' } = options;
  const offset = (page - 1) * limit;

  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, accountId);

    const whereClauses = ['o.AccountID = @AccountID'];
    if (status) {
      request.input('OrderStatus', sql.VarChar, status);
      whereClauses.push('o.OrderStatus = @OrderStatus');
    }
    const whereCondition = `WHERE ${whereClauses.join(' AND ')}`;

    const commonQuery = `
             FROM Orders o
             LEFT JOIN CoursePayments p ON o.PaymentID = p.PaymentID
             LEFT JOIN PaymentMethods pm ON p.PaymentMethodID = pm.MethodID
             ${whereCondition}
        `;

    const countResult = await request.query(
      `SELECT COUNT(o.OrderID) as total ${commonQuery}`
    );
    const { total } = countResult.recordset[0];

    request.input('Limit', sql.Int, limit);
    request.input('Offset', sql.Int, offset);
    const dataResult = await request.query(`
             SELECT
                  o.OrderID, o.OrderDate, o.FinalAmount, o.OrderStatus,
                  p.PaymentStatusID,
                  pm.MethodName as PaymentMethodName,
                  (SELECT COUNT(*) FROM OrderItems oi WHERE oi.OrderID = o.OrderID) as ItemCount
                  -- Lấy thêm các trường cần thiết cho list view
             ${commonQuery}
             ORDER BY o.OrderDate DESC
             OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
        `);

    return { orders: dataResult.recordset, total };
  } catch (error) {
    logger.error(`Error finding orders for user ${accountId}:`, error);
    throw error;
  }
};
module.exports = {
  createOrder,
  createOrderItems,
  updateOrderStatusAndPayment,
  linkOrderItemToEnrollment,
  findOrderByIdWithDetails,
  findOrdersByAccountId,
};
