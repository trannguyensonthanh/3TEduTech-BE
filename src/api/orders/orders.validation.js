const Joi = require('joi');
const OrderStatus = require('../../core/enums/OrderStatus');

const createOrder = {
  // Body có thể chứa promotionCode
  body: Joi.object().keys({
    promotionCode: Joi.string().trim().uppercase().allow(null, ''), // Cho phép mã promo
  }),
};

const getMyOrders = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(50),
    status: Joi.string()
      .valid(...Object.values(OrderStatus))
      .allow(null, ''),
  }),
};

const getMyOrderDetails = {
  params: Joi.object().keys({
    orderId: Joi.number().integer().required(),
  }),
};

module.exports = {
  createOrder,
  getMyOrders,
  getMyOrderDetails,
};
