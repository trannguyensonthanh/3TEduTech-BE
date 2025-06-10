// File: src/middlewares/currency.middleware.js (Tạo file mới)

const config = require('../config');

/**
 * Middleware để đọc header `X-Currency` từ request,
 * chuẩn hóa và gắn vào `req.targetCurrency`.
 * Nếu không có header, sẽ sử dụng tiền tệ cơ sở của hệ thống.
 */
const currencyHandler = (req, res, next) => {
  // Lấy giá trị từ header, chuyển thành chữ hoa và loại bỏ khoảng trắng
  const requestedCurrency = (req.header('X-Currency') || '')
    .trim()
    .toUpperCase();

  // Danh sách các tiền tệ được hỗ trợ (có thể lấy từ DB hoặc config)
  const supportedCurrencies = ['VND', 'USD']; // Ví dụ

  // Tiền tệ cơ sở của hệ thống (lấy từ config)
  const baseCurrency = config.settings.baseCurrency || 'VND'; // Mặc định là VND

  if (requestedCurrency && supportedCurrencies.includes(requestedCurrency)) {
    // Nếu có yêu cầu và được hỗ trợ, gán vào req
    req.targetCurrency = requestedCurrency;
  } else {
    // Nếu không, mặc định là tiền tệ cơ sở
    req.targetCurrency = baseCurrency;
  }

  next();
};

module.exports = currencyHandler;
