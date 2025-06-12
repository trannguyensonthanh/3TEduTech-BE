const httpStatus = require('http-status').status;
const notificationService = require('./notifications.service');
const { catchAsync } = require('../../utils/catchAsync');
const { pick } = require('../../utils/pick');

/**
 * Lấy danh sách thông báo của tôi
 */
const getMyNotifications = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const options = pick(req.query, ['limit', 'page', 'isRead']);
  const result = await notificationService.getMyNotifications(
    accountId,
    options
  );
  res.status(httpStatus.OK).send(result);
});

/**
 * Đánh dấu một thông báo là đã đọc
 */
const markAsRead = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const { notificationId } = req.params;
  await notificationService.markAsRead(accountId, notificationId);
  res.status(httpStatus.OK).send({ message: 'Đã đánh dấu là đã đọc.' });
});

/**
 * Đánh dấu tất cả thông báo là đã đọc
 */
const markAllAsRead = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const result = await notificationService.markAllAsRead(accountId);
  res.status(httpStatus.OK).send({
    message: `Đã đánh dấu ${result.markedCount} thông báo là đã đọc.`,
  });
});

/**
 * Lấy số lượng thông báo chưa đọc
 */
const getUnreadCount = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const count = await notificationService.countUnreadNotifications(accountId);
  res.status(httpStatus.OK).send({ unreadCount: count });
});

/**
 * Xóa một thông báo
 */
const deleteNotification = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const { notificationId } = req.params;
  await notificationService.deleteNotification(accountId, notificationId);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Xóa tất cả thông báo đã đọc
 */
const deleteAllReadNotifications = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const result =
    await notificationService.deleteAllReadNotifications(accountId);
  res
    .status(httpStatus.OK)
    .send({ message: `Đã xóa ${result.deletedCount} thông báo đã đọc.` });
});

/**
 * Xóa tất cả thông báo của tôi
 */
const deleteAllMyNotifications = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const result = await notificationService.deleteAllMyNotifications(accountId);
  res
    .status(httpStatus.OK)
    .send({ message: `Đã xóa ${result.deletedCount} thông báo.` });
});

module.exports = {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  deleteNotification,
  deleteAllReadNotifications,
  deleteAllMyNotifications,
};
