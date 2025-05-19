// src/api/payments/paymentMethod.service.js
const httpStatus = require('http-status');
const paymentMethodRepository = require('./paymentMethod.repository');
const ApiError = require('../../core/errors/ApiError');
const logger = require('../../utils/logger');
// Có thể cần import repository khác để kiểm tra ràng buộc trước khi xóa
// const instructorPayoutMethodRepository = require('../instructors/payoutMethod.repository');

/**
 * Lấy danh sách tất cả phương thức thanh toán khả dụng.
 * @returns {Promise<Array<object>>}
 */
const getAvailablePaymentMethods = async () => {
  // Lấy từ cache/DB
  const methods = await paymentMethodRepository.findAllMethods();
  // Có thể filter bớt các method không muốn hiển thị ở đây nếu cần
  return methods;
};

/**
 * Admin: Tạo phương thức thanh toán mới.
 * @param {object} methodData - { methodId, methodName }
 * @returns {Promise<object>}
 */
const createPaymentMethod = async (methodData) => {
  const { methodId, methodName } = methodData;
  // Repository đã xử lý lỗi trùng MethodID
  return paymentMethodRepository.createMethod({
    MethodID: methodId.toUpperCase(), // Chuẩn hóa ID thành chữ hoa?
    MethodName: methodName,
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
  return method;
};

/**
 * Admin: Cập nhật tên phương thức thanh toán.
 * @param {string} methodId
 * @param {object} updateData - { methodName }
 * @returns {Promise<object>}
 */
const updatePaymentMethod = async (methodId, updateData) => {
  await getPaymentMethod(methodId); // Check existence
  const { methodName } = updateData;
  if (!methodName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cần cung cấp tên mới.');
  }
  const updatedMethod = await paymentMethodRepository.updateMethodById(
    methodId,
    { MethodName: methodName }
  );
  if (!updatedMethod) {
    // Trường hợp không có gì thay đổi
    return getPaymentMethod(methodId);
  }
  return updatedMethod;
};

/**
 * Admin: Xóa phương thức thanh toán.
 * @param {string} methodId
 * @returns {Promise<void>}
 */
const deletePaymentMethod = async (methodId) => {
  await getPaymentMethod(methodId); // Check existence

  // TODO (Quan trọng): Kiểm tra xem phương thức này có đang được sử dụng không?
  // Ví dụ: Kiểm tra trong InstructorPayoutMethods, CoursePayments,...
  // const usageCount = await instructorPayoutMethodRepository.countUsage(methodId); // Cần tạo hàm này
  // if (usageCount > 0) {
  //     throw new ApiError(httpStatus.BAD_REQUEST, `Không thể xóa phương thức vì đang được ${usageCount} cấu hình sử dụng.`);
  // }
  // Repo delete đã có xử lý lỗi FK, nhưng check trước vẫn tốt hơn.

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
  // Admin functions
  createPaymentMethod,
  getPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
};
