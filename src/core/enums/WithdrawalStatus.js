const WithdrawalStatus = Object.freeze({
  PENDING: 'PENDING', // Yêu cầu mới từ GV
  APPROVED: 'APPROVED', // Admin đã duyệt, chờ xử lý chi trả
  REJECTED: 'REJECTED', // Admin từ chối
  PROCESSING: 'PROCESSING', // Đang được xử lý trong một Payout
  COMPLETED: 'COMPLETED', // Đã được chi trả thành công (Payout PAID)
  CANCELLED: 'CANCELLED', // GV hoặc Admin hủy yêu cầu
});

module.exports = WithdrawalStatus;
