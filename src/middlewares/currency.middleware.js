// File: src/middlewares/currency.middleware.js (Tạo file mới)

const config = require('../config');

/**
 * Middleware để đọc header `X-Currency` từ request,
 * chuẩn hóa và gắn vào `req.targetCurrency`.
 * Nếu không có header, sẽ sử dụng tiền tệ cơ sở của hệ thống.
 */
const currencyHandler = (req, res, next) => {
  const requestedCurrency = (req.header('X-Currency') || '')
    .trim()
    .toUpperCase();

  const supportedCurrencies = ['VND', 'USD'];

  const baseCurrency = config.settings.baseCurrency || 'VND';

  if (requestedCurrency && supportedCurrencies.includes(requestedCurrency)) {
    req.targetCurrency = requestedCurrency;
  } else {
    req.targetCurrency = baseCurrency;
  }

  next();
};

module.exports = currencyHandler;
