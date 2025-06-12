const PromotionStatus = Object.freeze({
  ACTIVE: 'ACTIVE', // Đang hoạt động, có thể áp dụng
  INACTIVE: 'INACTIVE', // Không hoạt động (do admin tắt hoặc chưa tới ngày)
  EXPIRED: 'EXPIRED', // Đã hết hạn sử dụng (quá ngày kết thúc)
});

module.exports = PromotionStatus;
