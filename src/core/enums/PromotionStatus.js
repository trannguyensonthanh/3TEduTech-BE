const PromotionStatus = Object.freeze({
  ACTIVE: 'ACTIVE', // Đang hoạt động, có thể áp dụng
  INACTIVE: 'INACTIVE', // Không hoạt động (do admin tắt hoặc chưa tới ngày)
  EXPIRED: 'EXPIRED', // Đã hết hạn sử dụng (quá ngày kết thúc)
  // Có thể thêm: SCHEDULED (Chưa tới ngày bắt đầu)
});

module.exports = PromotionStatus;
