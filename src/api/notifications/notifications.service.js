const httpStatus = require('http-status').status;
const notificationRepository = require('./notifications.repository');
const ApiError = require('../../core/errors/ApiError');
const logger = require('../../utils/logger');
const { toCamelCaseObject } = require('../../utils/caseConverter');
const eventManager = require('../../services/event.manager');

/**
 * Đếm số thông báo chưa đọc.
 * @param {number} accountId
 * @returns {Promise<number>}
 */
const countUnreadNotifications = async (accountId) => {
  return notificationRepository.countUnreadNotifications(accountId);
};

/**
 * Tạo thông báo mới (dùng nội bộ).
 * @param {number} recipientId
 * @param {string} type - Loại thông báo (e.g., 'COURSE_APPROVED', 'NEW_REPLY',...).
 * @param {string} message - Nội dung thông báo.
 * @param {object} [relatedEntity={}] - { type: 'Course', id: 123 }
 * @returns {Promise<object>} - Thông báo đã tạo.
 */
const createNotification = async (
  recipientId,
  type,
  message,
  relatedEntity = {}
) => {
  const notificationData = {
    RecipientAccountID: recipientId.toString(),
    Type: type,
    Message: message,
    RelatedEntityType: relatedEntity.type,
    RelatedEntityID: relatedEntity.id,
  };
  try {
    const notification =
      await notificationRepository.createNotification(notificationData);
    logger.info(`Notification created for user ${recipientId}, type: ${type}`);
    if (type === 'COURSE_SUBMITTED') {
      const unreadCount = await countUnreadNotifications(recipientId);
      eventManager.sendEventToUsers(
        recipientId.toString(),
        'new_notification',
        {
          notification: toCamelCaseObject(notification), // Gửi toàn bộ object notification mới
          unreadCount,
        }
      );
    }
    return notification;
  } catch (error) {
    logger.error(
      `Failed to create notification for user ${recipientId}:`,
      error
    );
    return null;
  }
};

/**
 * Lấy danh sách thông báo cho người dùng hiện tại.
 * @param {number} accountId
 * @param {object} options - { page, limit, isRead }
 * @returns {Promise<object>} - { notifications, total, page, limit, totalPages }
 */
const getMyNotifications = async (accountId, options) => {
  const { page = 1, limit = 10, isRead = null } = options;
  const result = await notificationRepository.findNotificationsByAccountId(
    accountId,
    { page, limit, isRead }
  );
  return {
    notifications: toCamelCaseObject(result.notifications),
    total: result.total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalPages: Math.ceil(result.total / limit),
  };
};

/**
 * Đánh dấu một thông báo là đã đọc.
 * @param {number} accountId - ID người dùng hiện tại.
 * @param {number} notificationId - ID thông báo cần đánh dấu.
 * @returns {Promise<void>}
 */
const markAsRead = async (accountId, notificationId) => {
  const rowsAffected = await notificationRepository.markNotificationAsRead(
    notificationId,
    accountId
  );
  if (rowsAffected === 0) {
    logger.warn(
      `Attempt to mark notification ${notificationId} as read for user ${accountId} affected 0 rows.`
    );
  } else {
    logger.info(
      `Notification ${notificationId} marked as read for user ${accountId}.`
    );
  }
};

/**
 * Đánh dấu tất cả thông báo là đã đọc.
 * @param {number} accountId
 * @returns {Promise<{ markedCount: number }>} - Số lượng thông báo đã được đánh dấu.
 */
const markAllAsRead = async (accountId) => {
  const markedCount =
    await notificationRepository.markAllNotificationsAsRead(accountId);
  logger.info(
    `${markedCount} notifications marked as read for user ${accountId}.`
  );
  return { markedCount };
};

/**
 * Xóa một thông báo cụ thể của người dùng.
 * @param {number} accountId - ID người dùng hiện tại.
 * @param {number} notificationId - ID thông báo cần xóa.
 * @returns {Promise<void>}
 */
const deleteNotification = async (accountId, notificationId) => {
  const rowsAffected =
    await notificationRepository.deleteNotificationByIdAndUser(
      notificationId,
      accountId
    );
  if (rowsAffected === 0) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Không tìm thấy thông báo hoặc bạn không có quyền xóa.'
    );
  }
  logger.info(`Notification ${notificationId} deleted for user ${accountId}.`);
};

/**
 * Xóa tất cả thông báo đã đọc của người dùng.
 * @param {number} accountId
 * @returns {Promise<{ deletedCount: number }>}
 */
const deleteAllReadNotifications = async (accountId) => {
  const deletedCount =
    await notificationRepository.deleteAllReadNotificationsForUser(accountId);
  logger.info(
    `${deletedCount} read notifications deleted for user ${accountId}.`
  );
  return { deletedCount };
};

/**
 * Xóa tất cả thông báo của người dùng.
 * @param {number} accountId
 * @returns {Promise<{ deletedCount: number }>}
 */
const deleteAllMyNotifications = async (accountId) => {
  const deletedCount =
    await notificationRepository.deleteAllNotificationsForUser(accountId);
  logger.info(
    `All ${deletedCount} notifications deleted for user ${accountId}.`
  );
  return { deletedCount };
};

module.exports = {
  createNotification,
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  countUnreadNotifications,
  deleteNotification,
  deleteAllReadNotifications,
  deleteAllMyNotifications,
};
