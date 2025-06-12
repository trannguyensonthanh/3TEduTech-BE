const { Decimal } = require('decimal.js');
const exchangeRateService = require('../api/exchangeRates/exchangeRates.service');
const config = require('../config');
const logger = require('./logger');

/**
 * Tạo cấu trúc pricing object cho một khóa học hoặc item.
 * @param {object} item - Đối tượng chứa giá gốc (ví dụ: course, cartItem).
 * @param {string} targetCurrency - Tiền tệ muốn hiển thị ('VND', 'USD').
 * @returns {Promise<object>} - Cấu trúc pricing { base, display }.
 */
const createPricingObject = async (item, targetCurrency) => {
  const baseCurrency = config.settings.baseCurrency || 'VND';

  const originalPrice = new Decimal(item.OriginalPrice || 0);
  const discountedPrice =
    item.DiscountedPrice !== null ? new Decimal(item.DiscountedPrice) : null;

  const pricing = {
    base: {
      currency: baseCurrency,
      originalPrice: originalPrice.toDP(4).toNumber(),
      discountedPrice: discountedPrice
        ? discountedPrice.toDP(4).toNumber()
        : null,
    },
    display: {
      currency: targetCurrency,
      originalPrice: originalPrice.toDP(4).toNumber(),
      discountedPrice: discountedPrice
        ? discountedPrice.toDP(4).toNumber()
        : null,
      exchangeRateUsed: null,
    },
  };

  if (targetCurrency !== baseCurrency) {
    try {
      const rate = await exchangeRateService.getLatestRate(
        baseCurrency,
        targetCurrency
      );
      pricing.display.exchangeRateUsed = rate.toNumber();

      pricing.display.originalPrice = originalPrice
        .times(rate)
        .toDP(2)
        .toNumber();
      if (discountedPrice) {
        pricing.display.discountedPrice = discountedPrice
          .times(rate)
          .toDP(2)
          .toNumber();
      }
    } catch (error) {
      logger.error(
        `Failed to convert price for item. Reverting to base currency. Error: ${error.message}`
      );

      pricing.display.currency = baseCurrency;
      pricing.display.exchangeRateUsed = null;
    }
  }

  return pricing;
};

module.exports = {
  createPricingObject,
};
