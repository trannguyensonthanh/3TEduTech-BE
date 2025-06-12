const Joi = require('joi');
const PromotionStatus = require('../../core/enums/PromotionStatus');

// Validate create promotion
const createPromotion = {
  body: Joi.object().keys({
    discountCode: Joi.string().required().max(50).trim().uppercase(),
    promotionName: Joi.string().required().max(255),
    description: Joi.string().allow(null, ''),
    discountType: Joi.string().required().valid('PERCENTAGE', 'FIXED_AMOUNT'),
    discountValue: Joi.number().required(),
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

// Validate get promotions
const getPromotions = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
    sortBy: Joi.string(),
    status: Joi.string().valid(...Object.values(PromotionStatus)),
  }),
};

// Validate get promotion by id
const getPromotion = {
  params: Joi.object().keys({
    promotionId: Joi.number().integer().required(),
  }),
};

// Validate update promotion
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
      endDate: Joi.date().iso(),
      maxUsageLimit: Joi.number().integer().min(1).allow(null),
      status: Joi.string().valid(...Object.values(PromotionStatus)),
    })
    .min(1)
    .with('endDate', 'startDate'),
};

// Validate deactivate promotion
const deactivatePromotion = {
  params: Joi.object().keys({
    promotionId: Joi.number().integer().required(),
  }),
};

// Validate delete promotion
const deletePromotion = {
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
  deletePromotion,
};
