// File: src/api/carts/carts.controller.js
const httpStatus = require('http-status').status;
const cartService = require('./carts.service');
const { catchAsync } = require('../../utils/catchAsync');

/**
 * Thêm khóa học vào giỏ hàng.
 */
const addCourseToCart = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const { courseId } = req.body;
  await cartService.addCourseToCart(accountId, courseId);
  const updatedCart = await cartService.viewCart(accountId, req.targetCurrency);
  res
    .status(httpStatus.OK)
    .send({ message: 'Đã thêm khóa học vào giỏ hàng.', cart: updatedCart });
});

/**
 * Xóa khóa học khỏi giỏ hàng.
 */
const removeCourseFromCart = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const { courseId } = req.params;
  await cartService.removeCourseFromCart(accountId, courseId);
  const updatedCart = await cartService.viewCart(accountId, req.targetCurrency);
  res
    .status(httpStatus.OK)
    .send({ message: 'Đã xóa khóa học khỏi giỏ hàng.', cart: updatedCart });
});

/**
 * Xem chi tiết giỏ hàng.
 */
const viewCart = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const cartDetails = await cartService.viewCart(accountId, req.targetCurrency);
  res.status(httpStatus.OK).send(cartDetails);
});

/**
 * Xóa toàn bộ giỏ hàng.
 */
const clearMyCart = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  await cartService.clearMyCart(accountId);
  const updatedCart = await cartService.viewCart(accountId, req.targetCurrency);
  res.status(httpStatus.OK).send({
    message: 'Giỏ hàng đã được xóa sạch.',
    cart: updatedCart,
  });
});

module.exports = {
  addCourseToCart,
  removeCourseFromCart,
  viewCart,
  clearMyCart,
};
