const httpStatus = require('http-status').status;
const axios = require('axios');
const { Decimal } = require('decimal.js');
const exchangeRateRepository = require('./exchangeRates.repository');

const ApiError = require('../../core/errors/ApiError');
const logger = require('../../utils/logger');
const { toCamelCaseObject } = require('../../utils/caseConverter');
const config = require('../../config');
const currencyRepository = require('../currencies/currencies.repository');

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
  const apiKey = config.exchangeRateApiKey;
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
  const targetCurrencies = ['USD'];

  try {
    const fetchedRates = await fetchRatesFromExternalAPI(
      baseCurrency,
      targetCurrencies
    );
    const createdRates = [];

    for (const currency in fetchedRates) {
      if (Object.prototype.hasOwnProperty.call(fetchedRates, currency)) {
        const forwardRateValue = new Decimal(fetchedRates[currency]);

        const forwardRateData = {
          FromCurrencyID: baseCurrency,
          ToCurrencyID: currency,
          Rate: forwardRateValue.toString(),
          Source: 'exchangerate-api.com',
        };
        const newForwardRate =
          await exchangeRateRepository.createExchangeRate(forwardRateData);
        createdRates.push(toCamelCaseObject(newForwardRate));

        rateCache.delete(`${baseCurrency}_${currency}`);

        if (forwardRateValue.isZero()) {
          logger.error(
            `Forward rate for ${currency} is zero, cannot calculate inverse rate.`
          );
        } else {
          const inverseRateValue = new Decimal(1).dividedBy(forwardRateValue);

          const inverseRateData = {
            FromCurrencyID: currency,
            ToCurrencyID: baseCurrency,
            Rate: inverseRateValue.toString(),
            Source: 'Calculated Inverse',
          };
          const newInverseRate =
            await exchangeRateRepository.createExchangeRate(inverseRateData);
          createdRates.push(toCamelCaseObject(newInverseRate));

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

/**
 * Lấy lịch sử tỷ giá (cho Admin).
 */
const getExchangeRateHistory = async (options) => {
  const { page = 1, limit = 20, fromCurrency, toCurrency } = options;
  const result = await exchangeRateRepository.findExchangeRateHistory({
    page,
    limit,
    fromCurrency,
    toCurrency,
  });
  return {
    exchangeRates: toCamelCaseObject(result.rates),
    total: result.total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalPages: Math.ceil(result.total / limit),
  };
};

/**
 * Admin tạo tỷ giá thủ công.
 */
const createManualExchangeRate = async (rateData) => {
  const { fromCurrencyId, toCurrencyId, rate, source } = rateData;

  if (fromCurrencyId.toUpperCase() === toCurrencyId.toUpperCase()) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Tiền tệ nguồn và đích không được trùng nhau.'
    );
  }

  const fromCurrency =
    await currencyRepository.findCurrencyById(fromCurrencyId);
  if (!fromCurrency) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Mã tiền tệ nguồn '${fromCurrencyId}' không tồn tại.`
    );
  }

  const toCurrency = await currencyRepository.findCurrencyById(toCurrencyId);
  if (!toCurrency) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Mã tiền tệ đích '${toCurrencyId}' không tồn tại.`
    );
  }

  const newRate = await exchangeRateRepository.createExchangeRate({
    FromCurrencyID: rateData.fromCurrencyId,
    ToCurrencyID: rateData.toCurrencyId,
    Rate: rateData.rate,
    Source: rateData.source || 'Manual',
    EffectiveTimestamp: rateData.effectiveTimestamp || new Date(),
  });

  rateCache.delete(`${rateData.fromCurrencyId}_${rateData.toCurrencyId}`);

  return toCamelCaseObject(newRate);
};

/**
 * Admin cập nhật tỷ giá thủ công.
 */
const updateManualExchangeRate = async (rateId, updateBody) => {
  const rateRecord = await exchangeRateRepository.findRateById(rateId);
  if (!rateRecord) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy bản ghi tỷ giá.');
  }

  const updatedRate = await exchangeRateRepository.updateExchangeRate(rateId, {
    Rate: updateBody.rate,
    EffectiveTimestamp: updateBody.effectiveTimestamp,
    Source: updateBody.source,
  });

  rateCache.delete(`${rateRecord.FromCurrencyID}_${rateRecord.ToCurrencyID}`);
  rateCache.delete(`${rateRecord.ToCurrencyID}_${rateRecord.FromCurrencyID}`);

  return toCamelCaseObject(updatedRate || rateRecord);
};

/**
 * Admin xóa một bản ghi tỷ giá.
 */
const deleteExchangeRate = async (rateId) => {
  const rateRecord = await exchangeRateRepository.findRateById(rateId);
  if (!rateRecord) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy bản ghi tỷ giá.');
  }

  await exchangeRateRepository.deleteExchangeRate(rateId);

  rateCache.delete(`${rateRecord.FromCurrencyID}_${rateRecord.ToCurrencyID}`);
  rateCache.delete(`${rateRecord.ToCurrencyID}_${rateRecord.FromCurrencyID}`);
};

/**
 * Lấy tỷ giá từ API của bên thứ 3 cho một cặp tiền tệ cụ thể.
 * @param {string} fromCurrency - Tiền tệ nguồn.
 * @param {string} toCurrency - Tiền tệ đích.
 * @returns {Promise<{rate: number, source: string}>}
 */
const fetchSingleExternalRate = async (fromCurrency, toCurrency) => {
  const from = await currencyRepository.findCurrencyById(fromCurrency);
  const to = await currencyRepository.findCurrencyById(toCurrency);
  if (!from || !to) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Mã tiền tệ không hợp lệ.');
  }

  try {
    const fetchedRates = await fetchRatesFromExternalAPI(fromCurrency, [
      toCurrency,
    ]);

    const rate = fetchedRates[toCurrency];

    if (rate === undefined) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        `Không tìm thấy tỷ giá cho cặp ${fromCurrency}->${toCurrency} từ API ngoài.`
      );
    }

    return {
      rate,
      source: 'exchangerate-api.com',
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Không thể kết nối đến dịch vụ tỷ giá bên ngoài.'
    );
  }
};

/**
 * Lấy tỷ giá mới nhất cho một cặp tiền tệ để hiển thị public.
 * @param {string} fromCurrencyId
 * @param {string} toCurrencyId
 * @returns {Promise<object>} - Object chứa thông tin tỷ giá đã được định dạng.
 */
const getLatestPublishedRate = async (fromCurrencyId, toCurrencyId) => {
  const fromCurrency =
    await currencyRepository.findCurrencyById(fromCurrencyId);
  if (!fromCurrency) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      `Mã tiền tệ nguồn không hợp lệ: ${fromCurrencyId}`
    );
  }
  const toCurrency = await currencyRepository.findCurrencyById(toCurrencyId);
  if (!toCurrency) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      `Mã tiền tệ đích không hợp lệ: ${toCurrencyId}`
    );
  }

  try {
    const rateDecimal = await getLatestRate(fromCurrencyId, toCurrencyId);

    const rateRecord = await exchangeRateRepository.findLatestRate(
      fromCurrencyId,
      toCurrencyId
    );

    return {
      from: rateRecord.FromCurrencyID,
      to: rateRecord.ToCurrencyID,
      rate: rateDecimal.toNumber(),
      source: rateRecord.Source,
      lastUpdated: rateRecord.EffectiveTimestamp,
    };
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.statusCode === httpStatus.INTERNAL_SERVER_ERROR
    ) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        `Không tìm thấy thông tin tỷ giá cho cặp ${fromCurrencyId} -> ${toCurrencyId}.`
      );
    }
    throw error;
  }
};

module.exports = {
  getLatestRate,
  updateExchangeRates,
  getExchangeRateHistory,
  createManualExchangeRate,
  updateManualExchangeRate,
  deleteExchangeRate,
  fetchSingleExternalRate,
  getLatestPublishedRate,
};
