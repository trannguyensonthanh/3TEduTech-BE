const Joi = require('joi');
const PaymentMethod = require('../../core/enums/PaymentMethod'); // Import enum

// Schema cho details dựa trên methodId (ví dụ)
const bankDetailsSchema = Joi.object({
  bankAccountNumber: Joi.string().required().max(50),
  bankName: Joi.string().required().max(100),
  bankAccountHolderName: Joi.string().required().max(150),
}).required();

const paypalDetailsSchema = Joi.object({
  email: Joi.string().email().required(),
}).required();

const addPayoutMethod = {
  body: Joi.object().keys({
    methodId: Joi.string()
      .required()
      .valid(PaymentMethod.BANK_TRANSFER, PaymentMethod.PAYPAL), // Chỉ cho phép các method hỗ trợ
    details: Joi.alternatives().conditional('methodId', {
      // Validate details dựa trên methodId
      is: PaymentMethod.BANK_TRANSFER,
      then: bankDetailsSchema,
      otherwise: Joi.alternatives().conditional('methodId', {
        is: PaymentMethod.PAYPAL,
        then: paypalDetailsSchema,
        otherwise: Joi.object().required(), // Mặc định nếu có method khác
      }),
    }),
    isPrimary: Joi.boolean().optional(),
  }),
};

const updatePayoutMethod = {
  params: Joi.object().keys({
    payoutMethodId: Joi.number().integer().required(),
  }),
  body: Joi.object()
    .keys({
      // Cho phép cập nhật details hoặc status hoặc isPrimary
      // Validation cho details cần phức tạp hơn vì phải biết methodId hiện tại
      // --> Tạm thời cho phép object bất kỳ, service sẽ validate kỹ hơn
      details: Joi.object().optional(),
      status: Joi.string().valid('ACTIVE', 'INACTIVE').optional(),
      isPrimary: Joi.boolean().optional(),
    })
    .min(1), // Phải có ít nhất 1 trường
};

const setPrimary = {
  params: Joi.object().keys({
    payoutMethodId: Joi.number().integer().required(),
  }),
};

const deletePayoutMethod = {
  params: Joi.object().keys({
    payoutMethodId: Joi.number().integer().required(),
  }),
};

const updatePayoutMethodDetails = {
  params: Joi.object().keys({
    payoutMethodId: Joi.number().integer().required(),
  }),
  body: Joi.object().required().min(1), // Yêu cầu body có dữ liệu, service sẽ validate chi tiết
};

module.exports = {
  addPayoutMethod,
  updatePayoutMethod,
  setPrimary,
  deletePayoutMethod,
  updatePayoutMethodDetails,
};
