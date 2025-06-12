// src/api/payments/paymentMethod.service.js
const httpStatus = require('http-status').status;
const paymentMethodRepository = require('./paymentMethod.repository');
const ApiError = require('../../core/errors/ApiError');
const logger = require('../../utils/logger');
const { toCamelCaseObject } = require('../../utils/caseConverter');

/**
 * Lấy danh sách tất cả phương thức thanh toán khả dụng.
 * @returns {Promise<Array<object>>}
 */
const getAvailablePaymentMethods = async () => {
  const methods = await paymentMethodRepository.findAllMethods();
  return toCamelCaseObject(methods);
};

/**
 * Admin: Tạo phương thức thanh toán mới.
 * @param {object} methodData - { methodId, methodName }
 * @returns {Promise<object>}
 */
const createPaymentMethod = async (methodData) => {
  const { methodId, methodName, iconUrl, description } = methodData;
  return paymentMethodRepository.createMethod({
    MethodID: methodId.toUpperCase(),
    MethodName: methodName,
    IconUrl: iconUrl,
    Description: description,
  });
};

/**
 * Admin: Lấy chi tiết một phương thức thanh toán.
 * @param {string} methodId
 * @returns {Promise<object>}
 */
const getPaymentMethod = async (methodId) => {
  const method = await paymentMethodRepository.findMethodById(methodId);
  if (!method) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Không tìm thấy phương thức thanh toán.'
    );
  }
  return toCamelCaseObject(method);
};

/**
 * Admin: Cập nhật tên phương thức thanh toán.
 * @param {string} methodId
 * @param {object} updateData - { methodName }
 * @returns {Promise<object>}
 */
const updatePaymentMethod = async (methodId, updateData) => {
  await getPaymentMethod(methodId);
  const { methodName } = updateData;
  if (!methodName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cần cung cấp tên mới.');
  }
  const dataToUpdate = {
    MethodName: updateData.methodName,
    IconUrl: updateData.iconUrl,
    Description: updateData.description,
  };
  Object.keys(dataToUpdate).forEach(
    (key) => dataToUpdate[key] === undefined && delete dataToUpdate[key]
  );

  if (Object.keys(dataToUpdate).length === 0) {
    return getPaymentMethod(methodId);
  }

  const updatedMethod = await paymentMethodRepository.updateMethodById(
    methodId,
    dataToUpdate
  );
  return toCamelCaseObject(updatedMethod);
};

/**
 * Admin: Xóa phương thức thanh toán.
 * @param {string} methodId
 * @returns {Promise<void>}
 */
const deletePaymentMethod = async (methodId) => {
  await getPaymentMethod(methodId);

  const deletedCount = await paymentMethodRepository.deleteMethodById(methodId);
  if (deletedCount === 0) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Xóa phương thức thanh toán thất bại.'
    );
  }
  logger.info(`Payment method ${methodId} deleted by admin.`);
};

module.exports = {
  getAvailablePaymentMethods,
  createPaymentMethod,
  getPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
};
