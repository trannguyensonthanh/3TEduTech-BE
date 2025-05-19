const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');

/**
 * Tạo thông báo mới.
 * @param {object} notificationData - { RecipientAccountID, Type, Message, RelatedEntityType, RelatedEntityID }
 * @returns {Promise<object>} - Thông báo vừa tạo.
 */
const createNotification = async (notificationData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input(
      'RecipientAccountID',
      sql.BigInt,
      notificationData.RecipientAccountID
    );
    request.input('Type', sql.VarChar, notificationData.Type);
    request.input('Message', sql.NVarChar, notificationData.Message);
    request.input(
      'RelatedEntityType',
      sql.VarChar,
      notificationData.RelatedEntityType
    ); // Có thể NULL
    request.input(
      'RelatedEntityID',
      sql.VarChar,
      notificationData.RelatedEntityID
    ); // Có thể NULL
    // IsRead mặc định là 0, CreatedAt mặc định là GETDATE()

    const result = await request.query(`
            INSERT INTO Notifications (RecipientAccountID, Type, Message, RelatedEntityType, RelatedEntityID)
            OUTPUT Inserted.*
            VALUES (@RecipientAccountID, @Type, @Message, @RelatedEntityType, @RelatedEntityID);
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error creating notification:', error);
    throw error;
  }
};

/**
 * Lấy danh sách thông báo cho người dùng (phân trang, lọc theo trạng thái đọc).
 * @param {number} accountId
 * @param {object} options - { page, limit, isRead (boolean | null) }
 * @returns {Promise<{notifications: object[], total: number}>}
 */
const findNotificationsByAccountId = async (accountId, options = {}) => {
  const { page = 1, limit = 10, isRead = null } = options; // isRead = null để lấy cả đọc và chưa đọc
  const offset = (page - 1) * limit;

  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('RecipientAccountID', sql.BigInt, accountId);

    const whereClauses = ['RecipientAccountID = @RecipientAccountID'];
    if (isRead !== null) {
      request.input('IsRead', sql.Bit, isRead);
      whereClauses.push('IsRead = @IsRead');
    }
    const whereCondition = `WHERE ${whereClauses.join(' AND ')}`;

    const commonQuery = `FROM Notifications ${whereCondition}`;

    // Đếm tổng số lượng (theo filter isRead)
    const countResult = await request.query(
      `SELECT COUNT(*) as total ${commonQuery}`
    );
    const { total } = countResult.recordset[0];

    // Lấy dữ liệu phân trang
    request.input('Limit', sql.Int, limit);
    request.input('Offset', sql.Int, offset);
    const dataResult = await request.query(`
            SELECT *
            ${commonQuery}
            ORDER BY CreatedAt DESC
            OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
        `);

    return { notifications: dataResult.recordset, total };
  } catch (error) {
    logger.error(
      `Error finding notifications for account ${accountId}:`,
      error
    );
    throw error;
  }
};

/**
 * Đánh dấu một thông báo là đã đọc.
 * @param {number} notificationId
 * @param {number} accountId - Để đảm bảo đúng người nhận đánh dấu đọc.
 * @returns {Promise<number>} - Số dòng bị ảnh hưởng (0 hoặc 1).
 */
const markNotificationAsRead = async (notificationId, accountId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('NotificationID', sql.BigInt, notificationId);
    request.input('RecipientAccountID', sql.BigInt, accountId);
    request.input('IsRead', sql.Bit, 1); // Đặt là đã đọc

    const result = await request.query(`
            UPDATE Notifications
            SET IsRead = @IsRead
            WHERE NotificationID = @NotificationID AND RecipientAccountID = @RecipientAccountID AND IsRead = 0; -- Chỉ update nếu chưa đọc
        `);
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(
      `Error marking notification ${notificationId} as read for account ${accountId}:`,
      error
    );
    throw error;
  }
};

/**
 * Đánh dấu tất cả thông báo của người dùng là đã đọc.
 * @param {number} accountId
 * @returns {Promise<number>} - Số dòng bị ảnh hưởng.
 */
const markAllNotificationsAsRead = async (accountId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('RecipientAccountID', sql.BigInt, accountId);
    request.input('IsRead', sql.Bit, 1);

    const result = await request.query(`
            UPDATE Notifications
            SET IsRead = @IsRead
            WHERE RecipientAccountID = @RecipientAccountID AND IsRead = 0; -- Chỉ update những cái chưa đọc
        `);
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(
      `Error marking all notifications as read for account ${accountId}:`,
      error
    );
    throw error;
  }
};

/**
 * Đếm số thông báo chưa đọc của người dùng.
 * @param {number} accountId
 * @returns {Promise<number>}
 */
const countUnreadNotifications = async (accountId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('RecipientAccountID', sql.BigInt, accountId);
    request.input('IsRead', sql.Bit, 0); // Chưa đọc

    const result = await request.query(`
            SELECT COUNT(*) as unreadCount
            FROM Notifications
            WHERE RecipientAccountID = @RecipientAccountID AND IsRead = @IsRead;
        `);
    return result.recordset[0].unreadCount;
  } catch (error) {
    logger.error(
      `Error counting unread notifications for account ${accountId}:`,
      error
    );
    throw error;
  }
};

/**
 * Xóa một thông báo cụ thể bằng ID (nếu nó thuộc về user).
 * @param {number} notificationId
 * @param {number} accountId - ID của người dùng sở hữu thông báo.
 * @returns {Promise<number>} - Số dòng bị ảnh hưởng (0 hoặc 1).
 */
const deleteNotificationByIdAndUser = async (notificationId, accountId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('NotificationID', sql.BigInt, notificationId);
    request.input('RecipientAccountID', sql.BigInt, accountId);

    const result = await request.query(`
            DELETE FROM Notifications
            WHERE NotificationID = @NotificationID AND RecipientAccountID = @RecipientAccountID;
        `);
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(
      `Error deleting notification ${notificationId} for account ${accountId}:`,
      error
    );
    throw error;
  }
};

/**
 * Xóa tất cả thông báo đã đọc của một người dùng.
 * @param {number} accountId
 * @returns {Promise<number>} - Số dòng bị ảnh hưởng.
 */
const deleteAllReadNotificationsForUser = async (accountId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('RecipientAccountID', sql.BigInt, accountId);
    request.input('IsRead', sql.Bit, 1); // Chỉ xóa những cái đã đọc

    const result = await request.query(`
            DELETE FROM Notifications
            WHERE RecipientAccountID = @RecipientAccountID AND IsRead = @IsRead;
        `);
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(
      `Error deleting all read notifications for account ${accountId}:`,
      error
    );
    throw error;
  }
};

/**
 * Xóa TẤT CẢ thông báo của một người dùng.
 * @param {number} accountId
 * @returns {Promise<number>} - Số dòng bị ảnh hưởng.
 */
const deleteAllNotificationsForUser = async (accountId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('RecipientAccountID', sql.BigInt, accountId);

    const result = await request.query(`
            DELETE FROM Notifications
            WHERE RecipientAccountID = @RecipientAccountID;
        `);
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(
      `Error deleting all notifications for account ${accountId}:`,
      error
    );
    throw error;
  }
};

module.exports = {
  createNotification,
  findNotificationsByAccountId,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  countUnreadNotifications,
  deleteNotificationByIdAndUser,
  deleteAllReadNotificationsForUser,
  deleteAllNotificationsForUser,
};
