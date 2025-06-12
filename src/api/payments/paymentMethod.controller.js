// src/api/payments/paymentMethod.controller.js
const httpStatus = require('http-status').status;
const paymentMethodService = require('./paymentMethod.service');
const { catchAsync } = require('../../utils/catchAsync');

const getPaymentMethods = catchAsync(async (req, res) => {
  const methods = await paymentMethodService.getAvailablePaymentMethods();
  res.status(httpStatus.OK).send({ paymentMethods: methods });
});

const createPaymentMethod = catchAsync(async (req, res) => {
  const method = await paymentMethodService.createPaymentMethod(req.body);
  res.status(httpStatus.CREATED).send(method);
});

const getPaymentMethod = catchAsync(async (req, res) => {
  const method = await paymentMethodService.getPaymentMethod(
    req.params.methodId
  );
  res.status(httpStatus.OK).send(method);
});

const updatePaymentMethod = catchAsync(async (req, res) => {
  const method = await paymentMethodService.updatePaymentMethod(
    req.params.methodId,
    req.body
  );
  res.status(httpStatus.OK).send(method);
});

const deletePaymentMethod = catchAsync(async (req, res) => {
  await paymentMethodService.deletePaymentMethod(req.params.methodId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  getPaymentMethods,
  createPaymentMethod,
  getPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
};
