// Đường dẫn: src/api/enrollments/enrollments.validation.js

const Joi = require('joi');

// Validation cho API tạo enrollment trực tiếp (có thể không cần nếu chỉ tạo qua payment)
const createEnrollment = {
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
  // Body có thể rỗng nếu giá lấy từ Course, hoặc chứa giá nếu cần ghi đè
  // body: Joi.object().keys({
  //     purchasePrice: Joi.number().min(0) // Ví dụ nếu API cho phép đặt giá
  // })
};

const getMyEnrollments = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(50), // Giới hạn số lượng lấy về
  }),
};

module.exports = {
  createEnrollment,
  getMyEnrollments,
};
