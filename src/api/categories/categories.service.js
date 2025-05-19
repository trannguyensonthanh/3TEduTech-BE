// File: src/api/categories/categories.service.js

const httpStatus = require('http-status').status;
const categoryRepository = require('./categories.repository');
const ApiError = require('../../core/errors/ApiError');
const { generateSlug } = require('../../utils/slugify');
const { toCamelCaseObject } = require('../../utils/caseConverter');

const createCategory = async (categoryData) => {
  const { categoryName, description, iconUrl } = categoryData;
  let slug = categoryData.slug
    ? generateSlug(categoryData.slug)
    : generateSlug(categoryName);

  // Kiểm tra trùng tên
  const existingName =
    await categoryRepository.findCategoryByName(categoryName);
  if (existingName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Tên danh mục đã tồn tại.');
  }

  // Kiểm tra trùng slug
  const existingSlug = await categoryRepository.findCategoryBySlug(slug);
  if (existingSlug) {
    // Nếu slug tự sinh bị trùng, thêm hậu tố ngẫu nhiên nhỏ
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

const getCategories = async (options) => {
  const { page = 1, limit = 0, searchTerm = '' } = options; // Mặc định lấy hết nếu limit=0
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
  // Nếu limit = 0, trả về toàn bộ danh sách không phân trang
  return { categories: toCamelCaseObject(result.categories) };
};

const getCategory = async (categoryId) => {
  const category = await categoryRepository.findCategoryById(categoryId);
  if (!category) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy danh mục.');
  }
  return toCamelCaseObject(category);
};

/**
 * Get category by slug
 * @param {string} slug
 * @returns {Promise<Category>}
 */
// --- Service method mới ---
const getCategoryBySlug = async (slug) => {
  const category = await categoryRepository.findCategoryBySlug(slug);
  // Repository nên trả về courseCount nếu cần thiết
  // Ví dụ: nếu findCategoryBySlug chưa có courseCount, bạn có thể thêm logic ở đây
  // hoặc tốt hơn là repository trả về luôn.
  // Giả sử findCategoryBySlug đã trả về courseCount như trong findAllCategories
  return toCamelCaseObject(category);
};

const updateCategory = async (categoryId, updateData) => {
  const category = await getCategory(categoryId); // Kiểm tra tồn tại

  const { categoryName, description, iconUrl } = updateData;
  const dataToUpdate = { description, iconUrl }; // Các trường có thể cập nhật trực tiếp

  // Xử lý CategoryName và Slug nếu có thay đổi
  if (categoryName && categoryName !== category.CategoryName) {
    const existingName =
      await categoryRepository.findCategoryByName(categoryName);
    if (existingName && existingName.CategoryID !== categoryId) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Tên danh mục đã tồn tại.');
    }
    dataToUpdate.CategoryName = categoryName;
    // Cập nhật slug theo tên mới nếu slug không được cung cấp
    if (!updateData.slug) {
      let newSlug = generateSlug(categoryName);
      const existingSlug = await categoryRepository.findCategoryBySlug(newSlug);
      if (existingSlug && existingSlug.CategoryID !== categoryId) {
        newSlug = `${newSlug}-${Math.random().toString(36).substring(2, 7)}`;
      }
      dataToUpdate.Slug = newSlug;
    }
  }

  // Xử lý Slug nếu được cung cấp riêng
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
    return category; // Không có gì thay đổi, trả về category hiện tại
  }

  const updatedCategory = await categoryRepository.updateCategoryById(
    categoryId,
    dataToUpdate
  );
  return toCamelCaseObject(updatedCategory);
};

const deleteCategory = async (categoryId) => {
  await getCategory(categoryId); // Kiểm tra tồn tại

  // Kiểm tra xem có khóa học nào đang dùng danh mục này không
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
    // Trường hợp hiếm gặp: category tồn tại nhưng không xóa được
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
