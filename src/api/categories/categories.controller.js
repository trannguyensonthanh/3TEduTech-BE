// File: src/api/categories/categories.controller.js

const httpStatus = require('http-status').status;
const categoryService = require('./categories.service');
const { catchAsync } = require('../../utils/catchAsync');
const { pick } = require('../../utils/pick');
const ApiError = require('../../core/errors/ApiError');

const createCategory = catchAsync(async (req, res) => {
  const category = await categoryService.createCategory(req.body);
  res.status(httpStatus.CREATED).send(category);
});

const getCategories = catchAsync(async (req, res) => {
  const options = pick(req.query, ['limit', 'page', 'searchTerm']);
  const result = await categoryService.getCategories(options);
  res.status(httpStatus.OK).send(result);
});

const getCategory = catchAsync(async (req, res) => {
  const category = await categoryService.getCategory(req.params.categoryId);
  res.status(httpStatus.OK).send(category);
});

// --- Controller method mới cho /slug/:categorySlug ---
const getCategoryBySlug = catchAsync(async (req, res) => {
  const category = await categoryService.getCategoryBySlug(
    req.params.categorySlug
  );
  if (!category) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');
  }
  res.send(category);
});

const updateCategory = catchAsync(async (req, res) => {
  const category = await categoryService.updateCategory(
    req.params.categoryId,
    req.body
  );
  res.status(httpStatus.OK).send(category);
});

const deleteCategory = catchAsync(async (req, res) => {
  await categoryService.deleteCategory(req.params.categoryId);
  res.status(httpStatus.NO_CONTENT).send(); // Hoặc OK với message
});

module.exports = {
  createCategory,
  getCategories,
  getCategory,
  updateCategory,
  deleteCategory,
  getCategoryBySlug,
};
