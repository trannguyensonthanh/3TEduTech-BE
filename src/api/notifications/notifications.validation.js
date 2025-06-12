const Joi = require('joi');

// Lấy danh sách thông báo
const getNotifications = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(50),
    isRead: Joi.boolean().optional(),
  }),
};

// Đánh dấu đã đọc một thông báo
const markAsRead = {
  params: Joi.object().keys({
    notificationId: Joi.number().integer().required(),
  }),
};

// Đánh dấu đã đọc tất cả thông báo
const markAllAsRead = {};

// Xóa một thông báo
const deleteNotification = {
  params: Joi.object().keys({
    notificationId: Joi.number().integer().required(),
  }),
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
