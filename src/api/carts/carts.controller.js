// File: src/api/carts/carts.controller.js

const httpStatus = require('http-status').status;
const cartService = require('./carts.service');
const { catchAsync } = require('../../utils/catchAsync');

const addCourseToCart = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const { courseId } = req.body;
  await cartService.addCourseToCart(accountId, courseId);
  // Trả về item vừa thêm hoặc toàn bộ giỏ hàng? Tạm thời trả về item
  // Hoặc trả về thông báo thành công và số lượng item mới
  const updatedCart = await cartService.viewCart(accountId, req.targetCurrency); // Lấy lại giỏ hàng sau khi thêm
  res
    .status(httpStatus.OK)
    .send({ message: 'Đã thêm khóa học vào giỏ hàng.', cart: updatedCart });
});

const removeCourseFromCart = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const { courseId } = req.params; // Lấy từ params
  await cartService.removeCourseFromCart(accountId, courseId);
  const updatedCart = await cartService.viewCart(accountId, req.targetCurrency); // Lấy lại giỏ hàng sau khi xóa
  res
    .status(httpStatus.OK)
    .send({ message: 'Đã xóa khóa học khỏi giỏ hàng.', cart: updatedCart });
});

const viewCart = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const cartDetails = await cartService.viewCart(accountId, req.targetCurrency);
  res.status(httpStatus.OK).send(cartDetails);
});

/**
 * Controller để xóa toàn bộ giỏ hàng.
 */
const clearMyCart = catchAsync(async (req, res) => {
  const accountId = req.user.id;

  await cartService.clearMyCart(accountId);

  // Sau khi xóa, lấy lại thông tin giỏ hàng (bây giờ đã trống) để trả về cho FE cập nhật state.
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
