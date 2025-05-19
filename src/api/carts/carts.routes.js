// file: src/api/carts/carts.routes.js

const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const cartValidation = require('./carts.validation');
const cartController = require('./carts.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Các route này đều yêu cầu đăng nhập
router.use(authenticate);

// Lấy thông tin giỏ hàng hiện tại
router.get('/', cartController.viewCart);

// Thêm khóa học vào giỏ
router.post(
  '/',
  validate(cartValidation.addCourseToCart),
  cartController.addCourseToCart
);

// Xóa khóa học khỏi giỏ
router.delete(
  '/courses/:courseId', // Dùng courseId trong params
  validate(cartValidation.removeCourseFromCart),
  cartController.removeCourseFromCart
);

// Có thể thêm route PATCH để cập nhật số lượng nếu giỏ hàng hỗ trợ (hiện tại không)
// Có thể thêm route DELETE / để xóa toàn bộ giỏ hàng

module.exports = router;
