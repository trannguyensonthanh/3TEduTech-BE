// src/api/languages/languages.controller.js
const httpStatus = require('http-status').status;
const languageService = require('./languages.service');
const { catchAsync } = require('../../utils/catchAsync');
const { pick } = require('../../utils/pick');

const getLanguages = catchAsync(async (req, res) => {
  const options = pick(req.query, ['isActive', 'page', 'limit', 'sortBy']);
  const result = await languageService.getLanguages(options);

  res.status(httpStatus.OK).send(result); // Service đã trả về cấu trúc có phân trang
});

const getLanguage = catchAsync(async (req, res) => {
  const language = await languageService.getLanguageByCode(
    req.params.languageCode
  );
  res.status(httpStatus.OK).send(language);
});

const createLanguage = catchAsync(async (req, res) => {
  const language = await languageService.createLanguage(req.body);
  res.status(httpStatus.CREATED).send(language);
});

const updateLanguage = catchAsync(async (req, res) => {
  const language = await languageService.updateLanguage(
    req.params.languageCode,
    req.body
  );
  res.status(httpStatus.OK).send(language);
});

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
