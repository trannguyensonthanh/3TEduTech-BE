// File: src/api/exchangeRates/exchangeRates.service.js

const httpStatus = require('http-status').status;
const axios = require('axios');
const { Decimal } = require('decimal.js');
const exchangeRateRepository = require('./exchangeRates.repository');

const ApiError = require('../../core/errors/ApiError');
const logger = require('../../utils/logger');
const { toCamelCaseObject } = require('../../utils/caseConverter');
const config = require('../../config');

// Cache đơn giản cho tỷ giá
const rateCache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 phút

/**
 * Lấy tỷ giá mới nhất, ưu tiên cache.
 * @param {string} fromCurrency
 * @param {string} toCurrency
 * @returns {Promise<Decimal>} - Tỷ giá dạng Decimal.
 */
const getLatestRate = async (fromCurrency, toCurrency) => {
  const cacheKey = `${fromCurrency}_${toCurrency}`;
  const cached = rateCache.get(cacheKey);

  if (cached && cached.expires > Date.now()) {
    // logger.debug(`Cache hit for exchange rate: ${cacheKey}`);
    return cached.rate;
  }

  const rateRecord = await exchangeRateRepository.findLatestRate(
    fromCurrency,
    toCurrency
  );
  if (!rateRecord) {
    logger.error(
      `Exchange rate from ${fromCurrency} to ${toCurrency} not found in DB.`
    );
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Không tìm thấy tỷ giá cho ${fromCurrency} -> ${toCurrency}.`
    );
  }

  const rate = new Decimal(rateRecord.Rate.toString());
  rateCache.set(cacheKey, { rate, expires: Date.now() + CACHE_TTL });

  return rate;
};

/**
 * Lấy tỷ giá từ API của bên thứ 3 (ví dụ: exchangerate-api.com).
 * @param {string} baseCurrency - Tiền tệ cơ sở (VND).
 * @param {string[]} targetCurrencies - Mảng các tiền tệ muốn lấy tỷ giá (['USD']).
 * @returns {Promise<object>} - Object chứa các tỷ giá, ví dụ { USD: 0.000042 }.
 */
const fetchRatesFromExternalAPI = async (baseCurrency, targetCurrencies) => {
  // Thay thế bằng API tỷ giá bạn chọn
  // Ví dụ với exchangerate-api.com (cần đăng ký key miễn phí)
  const apiKey = config.exchangeRateApiKey; // Cần thêm vào .env
  if (!apiKey) {
    logger.warn(
      'EXCHANGE_RATE_API_KEY is not configured. Cannot fetch live rates.'
    );
    throw new Error('Exchange rate API is not configured.');
  }
  const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${baseCurrency}`;

  try {
    const response = await axios.get(url);
    if (response.data && response.data.result === 'success') {
      const rates = {};
      targetCurrencies.forEach((currency) => {
        if (response.data.conversion_rates[currency]) {
          rates[currency] = response.data.conversion_rates[currency];
        }
      });
      return rates;
    }
    throw new Error(
      `Failed to fetch rates from external API: ${response.data['error-type']}`
    );
  } catch (error) {
    logger.error('Error fetching rates from external API:', error.message);
    throw error;
  }
};

/**
 * Cập nhật tỷ giá vào DB, bao gồm cả tỷ giá ngược lại.
 * @returns {Promise<object[]>} - Mảng các tỷ giá mới đã được tạo (cả xuôi và ngược).
 */
const updateExchangeRates = async () => {
  const baseCurrency = config.settings.baseCurrency || 'VND';
  const targetCurrencies = ['USD']; // Các tiền tệ cần quy đổi

  try {
    const fetchedRates = await fetchRatesFromExternalAPI(
      baseCurrency,
      targetCurrencies
    );
    const createdRates = [];

    for (const currency in fetchedRates) {
      if (Object.prototype.hasOwnProperty.call(fetchedRates, currency)) {
        const forwardRateValue = new Decimal(fetchedRates[currency]);

        // === 1. TẠO TỶ GIÁ XUÔI (VND -> USD) ===
        const forwardRateData = {
          FromCurrencyID: baseCurrency,
          ToCurrencyID: currency,
          Rate: forwardRateValue.toNumber(), // Lưu dạng số
          Source: 'exchangerate-api.com',
        };
        const newForwardRate =
          await exchangeRateRepository.createExchangeRate(forwardRateData);
        createdRates.push(toCamelCaseObject(newForwardRate));

        // Xóa cache cho tỷ giá xuôi
        rateCache.delete(`${baseCurrency}_${currency}`);

        // === 2. TÍNH VÀ TẠO TỶ GIÁ NGƯỢC (USD -> VND) ===
        if (forwardRateValue.isZero()) {
          logger.error(
            `Forward rate for ${currency} is zero, cannot calculate inverse rate.`
          );
        } else {
          // Tính tỷ giá ngược: 1 / forwardRate
          const inverseRateValue = new Decimal(1).dividedBy(forwardRateValue);

          const inverseRateData = {
            FromCurrencyID: currency,
            ToCurrencyID: baseCurrency,
            Rate: inverseRateValue.toDP(18).toNumber(), // Lưu với độ chính xác cao
            Source: 'Calculated Inverse', // Ghi rõ là tỷ giá được tính toán
          };
          const newInverseRate =
            await exchangeRateRepository.createExchangeRate(inverseRateData);
          createdRates.push(toCamelCaseObject(newInverseRate));

          // Xóa cache cho tỷ giá ngược
          rateCache.delete(`${currency}_${baseCurrency}`);
        }
      }
    }

    logger.info(
      `Successfully updated exchange rates (forward and inverse) for: ${Object.keys(fetchedRates).join(', ')}`
    );
    return createdRates;
  } catch (error) {
    logger.error('Failed to run updateExchangeRates job.', error);
  }
};

const getExchangeRateHistory = async (options) => {
  const { page = 1, limit = 20 } = options;
  const result = await exchangeRateRepository.findExchangeRateHistory({
    page,
    limit,
  });
  return {
    rates: toCamelCaseObject(result.rates),
    total: result.total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalPages: Math.ceil(result.total / limit),
  };
};

module.exports = {
  getLatestRate,
  updateExchangeRates,
  getExchangeRateHistory,
};
