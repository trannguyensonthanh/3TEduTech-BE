const Joi = require('joi');
const PromotionStatus = require('../../core/enums/PromotionStatus');

const createPromotion = {
  body: Joi.object().keys({
    discountCode: Joi.string().required().max(50).trim().uppercase(),
    promotionName: Joi.string().required().max(255),
    description: Joi.string().allow(null, ''),
    discountType: Joi.string().required().valid('PERCENTAGE', 'FIXED_AMOUNT'),
    discountValue: Joi.number().required(), // Validate range in service
    minOrderValue: Joi.number().min(0).allow(null),
    maxDiscountAmount: Joi.number().min(0).allow(null),
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().required().greater(Joi.ref('startDate')),
    maxUsageLimit: Joi.number().integer().min(1).allow(null),
    status: Joi.string()
      .valid(...Object.values(PromotionStatus))
      .optional(),
  }),
};

const getPromotions = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
    sortBy: Joi.string(),
    status: Joi.string().valid(...Object.values(PromotionStatus)),
  }),
};

const getPromotion = {
  params: Joi.object().keys({
    promotionId: Joi.number().integer().required(),
  }),
};

const updatePromotion = {
  params: Joi.object().keys({
    promotionId: Joi.number().integer().required(),
  }),
  body: Joi.object()
    .keys({
      discountCode: Joi.string().max(50).trim().uppercase(),
      promotionName: Joi.string().max(255),
      description: Joi.string().allow(null, ''),
      discountType: Joi.string().valid('PERCENTAGE', 'FIXED_AMOUNT'),
      discountValue: Joi.number(),
      minOrderValue: Joi.number().min(0).allow(null),
      maxDiscountAmount: Joi.number().min(0).allow(null),
      startDate: Joi.date().iso(),
      endDate: Joi.date().iso(), // .greater(Joi.ref('startDate')), // Cần xử lý phức tạp hơn nếu chỉ update 1 trong 2
      maxUsageLimit: Joi.number().integer().min(1).allow(null),
      status: Joi.string().valid(...Object.values(PromotionStatus)),
    })
    .min(1) // Phải có ít nhất 1 trường để update
    .with('endDate', 'startDate'), // Nếu cập nhật endDate thì cũng phải có startDate
};

const deactivatePromotion = {
  params: Joi.object().keys({
    promotionId: Joi.number().integer().required(),
  }),
};

module.exports = {
  createPromotion,
  getPromotions,
  getPromotion,
  updatePromotion,
  deactivatePromotion,
};
