// File: src/api/categories/categories.service.js

const httpStatus = require('http-status').status;
const categoryRepository = require('./categories.repository');
const ApiError = require('../../core/errors/ApiError');
const { generateSlug } = require('../../utils/slugify');
const { toCamelCaseObject } = require('../../utils/caseConverter');
/**
 * Tạo mới danh mục
 */
const createCategory = async (categoryData) => {
  const { categoryName, description, iconUrl } = categoryData;
  let slug = categoryData.slug
    ? generateSlug(categoryData.slug)
    : generateSlug(categoryName);

  const existingName =
    await categoryRepository.findCategoryByName(categoryName);
  if (existingName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Tên danh mục đã tồn tại.');
  }

  const existingSlug = await categoryRepository.findCategoryBySlug(slug);
  if (existingSlug) {
    slug = `${slug}-${Math.random().toString(36).substring(2, 7)}`;
  }
  const result = await categoryRepository.createCategory({
    categoryName,
    slug,
    description,
    iconUrl,
  });
  return toCamelCaseObject(result);
};

/**
 * Lấy danh sách danh mục (có phân trang)
 */
const getCategories = async (options) => {
  const { page = 1, limit = 0, searchTerm = '' } = options;
  const result = await categoryRepository.findAllCategories({
    page,
    limit,
    searchTerm,
  });

  if (limit > 0) {
    return {
      categories: toCamelCaseObject(result.categories),
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
    };
  }
  return { categories: toCamelCaseObject(result.categories) };
};

/**
 * Lấy thông tin danh mục theo ID
 */
const getCategory = async (categoryId) => {
  const category = await categoryRepository.findCategoryById(categoryId);
  if (!category) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy danh mục.');
  }
  return toCamelCaseObject(category);
};

/**
 * Lấy danh mục theo slug
 * @param {string} slug
 * @returns {Promise<Category>}
 */
const getCategoryBySlug = async (slug) => {
  const category = await categoryRepository.findCategoryBySlug(slug);
  return toCamelCaseObject(category);
};

/**
 * Cập nhật danh mục
 */
const updateCategory = async (categoryId, updateData) => {
  const category = await getCategory(categoryId);

  const { categoryName, description, iconUrl } = updateData;
  const dataToUpdate = { description, iconUrl };

  if (categoryName && categoryName !== category.CategoryName) {
    const existingName =
      await categoryRepository.findCategoryByName(categoryName);
    if (existingName && existingName.CategoryID !== categoryId) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Tên danh mục đã tồn tại.');
    }
    dataToUpdate.CategoryName = categoryName;
    if (!updateData.slug) {
      let newSlug = generateSlug(categoryName);
      const existingSlug = await categoryRepository.findCategoryBySlug(newSlug);
      if (existingSlug && existingSlug.CategoryID !== categoryId) {
        newSlug = `${newSlug}-${Math.random().toString(36).substring(2, 7)}`;
      }
      dataToUpdate.Slug = newSlug;
    }
  }

  if (updateData.slug) {
    const newSlug = generateSlug(updateData.slug);
    if (newSlug !== category.Slug) {
      const existingSlug = await categoryRepository.findCategoryBySlug(newSlug);
      if (existingSlug && existingSlug.CategoryID !== categoryId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Slug đã tồn tại.');
      }
      dataToUpdate.Slug = newSlug;
    }
  }

  if (Object.keys(dataToUpdate).length === 0) {
    return category;
  }

  const updatedCategory = await categoryRepository.updateCategoryById(
    categoryId,
    dataToUpdate
  );
  return toCamelCaseObject(updatedCategory);
};

/**
 * Xóa danh mục
 */
const deleteCategory = async (categoryId) => {
  await getCategory(categoryId);

  const courseCount =
    await categoryRepository.countCoursesInCategory(categoryId);
  if (courseCount > 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Không thể xóa danh mục vì đang có ${courseCount} khóa học sử dụng.`
    );
  }

  const deletedRows = await categoryRepository.deleteCategoryById(categoryId);
  if (deletedRows === 0) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Xóa danh mục thất bại.'
    );
  }
};

module.exports = {
  createCategory,
  getCategories,
  getCategory,
  updateCategory,
  deleteCategory,
  getCategoryBySlug,
};
