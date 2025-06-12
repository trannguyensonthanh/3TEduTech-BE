const Joi = require('joi');
const PaymentMethod = require('../../core/enums/PaymentMethod');

const bankDetailsSchema = Joi.object({
  bankAccountNumber: Joi.string().required().max(50),
  bankName: Joi.string().required().max(100),
  bankAccountHolderName: Joi.string().required().max(150),
}).required();

const paypalDetailsSchema = Joi.object({
  email: Joi.string().email().required(),
}).required();

// Thêm phương thức thanh toán
const addPayoutMethod = {
  body: Joi.object().keys({
    methodId: Joi.string()
      .required()
      .valid(
        PaymentMethod.BANK_TRANSFER,
        PaymentMethod.PAYPAL,
        PaymentMethod.MOMO,
        PaymentMethod.VNPAY,
        PaymentMethod.SYSTEM_CREDIT,
        PaymentMethod.CRYPTO,
        PaymentMethod.STRIPE
      ),
    details: Joi.alternatives().conditional('methodId', [
      {
        is: PaymentMethod.BANK_TRANSFER,
        then: bankDetailsSchema,
      },
      {
        is: PaymentMethod.PAYPAL,
        then: paypalDetailsSchema,
      },
      {
        is: Joi.valid(
          PaymentMethod.MOMO,
          PaymentMethod.VNPAY,
          PaymentMethod.SYSTEM_CREDIT,
          PaymentMethod.CRYPTO,
          PaymentMethod.STRIPE
        ),
        then: Joi.object().required(),
      },
    ]),
    isPrimary: Joi.boolean().optional(),
  }),
};

// Cập nhật phương thức thanh toán
const updatePayoutMethod = {
  params: Joi.object().keys({
    payoutMethodId: Joi.number().integer().required(),
  }),
  body: Joi.object()
    .keys({
      details: Joi.object().optional(),
      status: Joi.string().valid('ACTIVE', 'INACTIVE').optional(),
      isPrimary: Joi.boolean().optional(),
    })
    .min(1),
};

// Đặt phương thức thanh toán chính
const setPrimary = {
  params: Joi.object().keys({
    payoutMethodId: Joi.number().integer().required(),
  }),
};

// Xóa phương thức thanh toán
const deletePayoutMethod = {
  params: Joi.object().keys({
    payoutMethodId: Joi.number().integer().required(),
  }),
};

// Cập nhật chi tiết phương thức thanh toán
const updatePayoutMethodDetails = {
  params: Joi.object().keys({
    payoutMethodId: Joi.number().integer().required(),
  }),
  body: Joi.object().required().min(1),
};

module.exports = {
  addPayoutMethod,
  updatePayoutMethod,
  setPrimary,
  deletePayoutMethod,
  updatePayoutMethodDetails,
};
