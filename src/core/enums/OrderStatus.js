const OrderStatus = Object.freeze({
  PENDING_PAYMENT: 'PENDING_PAYMENT', // Chờ thanh toán (sau khi tạo đơn)
  PROCESSING: 'PROCESSING', // Đang xử lý thanh toán (nếu cần)
  COMPLETED: 'COMPLETED', // Thanh toán thành công, đã enroll
  FAILED: 'FAILED', // Thanh toán thất bại
  CANCELLED: 'CANCELLED', // Đơn hàng bị hủy (bởi user hoặc hệ thống)
});

module.exports = OrderStatus;
