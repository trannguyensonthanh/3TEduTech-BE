// File: src/api/currencies/currencies.service.js

const httpStatus = require('http-status').status;
const currencyRepository = require('./currencies.repository');
const ApiError = require('../../core/errors/ApiError');
const { toCamelCaseObject } = require('../../utils/caseConverter');

/**
 * Tạo mới một loại tiền tệ
 */
const createCurrency = async (currencyBody) => {
  const { currencyId, currencyName, type, decimalPlaces } = currencyBody;
  const normalizedId = currencyId.toUpperCase();

  if (await currencyRepository.findCurrencyById(normalizedId)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Mã tiền tệ '${normalizedId}' đã tồn tại.`
    );
  }
  if (await currencyRepository.findCurrencyByName(currencyName)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Tên tiền tệ '${currencyName}' đã tồn tại.`
    );
  }

  const newCurrency = await currencyRepository.createCurrency({
    CurrencyID: normalizedId,
    CurrencyName: currencyName,
    Type: type,
    DecimalPlaces: decimalPlaces,
  });
  return toCamelCaseObject(newCurrency);
};

/**
 * Lấy danh sách các loại tiền tệ với phân trang và tìm kiếm
 */
const getCurrencies = async (options) => {
  const { page = 1, limit = 10, searchTerm = '' } = options;
  const result = await currencyRepository.findAllCurrencies({
    page,
    limit,
    searchTerm,
  });

  return {
    currencies: toCamelCaseObject(result.currencies),
    total: result.total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalPages: Math.ceil(result.total / limit),
  };
};

/**
 * Cập nhật thông tin loại tiền tệ
 */
const updateCurrency = async (currencyId, updateBody) => {
  const currency = await currencyRepository.findCurrencyById(currencyId);
  if (!currency) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy tiền tệ.');
  }

  if (
    updateBody.currencyName &&
    updateBody.currencyName !== currency.CurrencyName
  ) {
    const existingName = await currencyRepository.findCurrencyByName(
      updateBody.currencyName
    );
    if (existingName) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Tên tiền tệ đã tồn tại.');
    }
  }
  const dataToUpdate = {
    CurrencyName: updateBody.currencyName,
    Type: updateBody.type,
    DecimalPlaces: updateBody.decimalPlaces,
  };
  Object.keys(dataToUpdate).forEach(
    (key) => dataToUpdate[key] === undefined && delete dataToUpdate[key]
  );

  if (Object.keys(dataToUpdate).length === 0) {
    return toCamelCaseObject(currency);
  }

  const updatedCurrency = await currencyRepository.updateCurrencyById(
    currencyId,
    dataToUpdate
  );
  return toCamelCaseObject(updatedCurrency || currency);
};

/**
 * Xóa một loại tiền tệ
 */
const deleteCurrency = async (currencyId) => {
  const currency = await currencyRepository.findCurrencyById(currencyId);
  if (!currency) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy tiền tệ.');
  }

  const inUse = await currencyRepository.isCurrencyInUse(currencyId);
  if (inUse) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Không thể xóa tiền tệ vì đang được sử dụng.'
    );
  }

  await currencyRepository.deleteCurrencyById(currencyId);
};

module.exports = {
  createCurrency,
  getCurrencies,
  updateCurrency,
  deleteCurrency,
};
