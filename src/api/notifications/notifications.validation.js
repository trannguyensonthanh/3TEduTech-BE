const Joi = require('joi');

const getNotifications = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(50),
    isRead: Joi.boolean().optional(), // true=đã đọc, false=chưa đọc, không có=cả hai
  }),
};

const markAsRead = {
  params: Joi.object().keys({
    notificationId: Joi.number().integer().required(),
  }),
};

const markAllAsRead = {
  // Không cần params hay body
};
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
