const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const notificationValidation = require('./notifications.validation');
const notificationController = require('./notifications.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Các route này yêu cầu user đăng nhập
router.use(authenticate);

// Lấy danh sách thông báo
router.get(
  '/',
  validate(notificationValidation.getNotifications),
  notificationController.getMyNotifications
);

// Lấy số lượng thông báo chưa đọc
router.get('/unread-count', notificationController.getUnreadCount);

// Đánh dấu tất cả là đã đọc
router.post(
  '/mark-all-read',
  validate(notificationValidation.markAllAsRead),
  notificationController.markAllAsRead
);

// Đánh dấu một thông báo là đã đọc
router.patch(
  '/:notificationId/read',
  validate(notificationValidation.markAsRead),
  notificationController.markAsRead
);

// Route để xóa tất cả thông báo đã đọc
router.delete('/read', notificationController.deleteAllReadNotifications);

// Route để xóa tất cả thông báo
router.delete('/all', notificationController.deleteAllMyNotifications);

// Route để xóa một thông báo cụ thể (đặt cuối cùng để không bị nhầm với /unread-count hay /read)
router.delete(
  '/:notificationId',
  validate(notificationValidation.deleteNotification),
  notificationController.deleteNotification
);

module.exports = router;
