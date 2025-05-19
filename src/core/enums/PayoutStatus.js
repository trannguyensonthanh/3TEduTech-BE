const PayoutStatus = Object.freeze({
  PENDING: 'PENDING', // Chờ Admin xử lý (sau khi request được approve)
  PROCESSING: 'PROCESSING', // Admin đang thực hiện chi trả
  PAID: 'PAID', // Đã chi trả thành công
  FAILED: 'FAILED', // Chi trả thất bại
  CANCELLED: 'CANCELLED', // Admin hủy yêu cầu chi trả
});

module.exports = PayoutStatus;
