// src/api/languages/languages.controller.js
const httpStatus = require('http-status').status;
const languageService = require('./languages.service');
const { catchAsync } = require('../../utils/catchAsync');
const { pick } = require('../../utils/pick');

// Lấy danh sách ngôn ngữ
const getLanguages = catchAsync(async (req, res) => {
  const options = pick(req.query, ['isActive', 'page', 'limit', 'sortBy']);
  const result = await languageService.getLanguages(options);
  res.status(httpStatus.OK).send(result);
});

// Lấy thông tin ngôn ngữ theo mã
const getLanguage = catchAsync(async (req, res) => {
  const language = await languageService.getLanguageByCode(
    req.params.languageCode
  );
  res.status(httpStatus.OK).send(language);
});

// Tạo ngôn ngữ mới
const createLanguage = catchAsync(async (req, res) => {
  const language = await languageService.createLanguage(req.body);
  res.status(httpStatus.CREATED).send(language);
});

// Cập nhật ngôn ngữ
const updateLanguage = catchAsync(async (req, res) => {
  const language = await languageService.updateLanguage(
    req.params.languageCode,
    req.body
  );
  res.status(httpStatus.OK).send(language);
});

// Xóa ngôn ngữ
const deleteLanguage = catchAsync(async (req, res) => {
  await languageService.deleteLanguage(req.params.languageCode);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  getLanguages,
  getLanguage,
  createLanguage,
  updateLanguage,
  deleteLanguage,
};
