// src/api/languages/languages.service.js
const httpStatus = require('http-status');
const languageRepository = require('./languages.repository');
const ApiError = require('../../core/errors/ApiError');
const logger = require('../../utils/logger');
const { toCamelCaseObject } = require('../../utils/caseConverter');

/**
 * Lấy danh sách ngôn ngữ (có phân trang và filter theo active).
 * @param {object} options - { isActive?: boolean | null, page?: number, limit?: number, sortBy?: string }
 * @returns {Promise<{languages: Array<object>, total: number, page: number, limit: number, totalPages: number}>}
 */
const getLanguages = async (options = {}) => {
  const {
    isActive = null,
    page = 1,
    limit = 10,
    sortBy = 'DisplayOrder:asc',
  } = options; // Gán giá trị mặc định ở đây
  // Nếu FE gửi limit = 0 (hoặc không gửi limit và muốn mặc định lấy hết), thì repo sẽ xử lý
  const effectiveLimit = limit === 0 ? 0 : options.limit || 10; // Để repo xử lý limit 0

  const result = await languageRepository.findAllLanguages({
    isActive,
    page,
    limit: effectiveLimit,
    sortBy,
  });

  const response = {
    languages: toCamelCaseObject(result.languages),
    total: result.total,
    page: parseInt(page, 10),
    limit: effectiveLimit, // Trả về limit đã dùng
    totalPages:
      effectiveLimit > 0 ? Math.ceil(result.total / effectiveLimit) : 1,
  };
  // Nếu không phân trang, page và totalPages có thể không cần thiết hoặc đặt là 1
  if (effectiveLimit === 0) {
    response.limit = result.total; // Nếu lấy tất cả, limit bằng total
    response.page = 1;
    response.totalPages = 1;
  }

  return response;
};

/**
 * Lấy chi tiết một ngôn ngữ.
 * @param {string} languageCode
 * @returns {Promise<object>}
 */
const getLanguageByCode = async (languageCode) => {
  const language = await languageRepository.findLanguageByCode(
    languageCode.toLowerCase()
  ); // Chuẩn hóa code
  if (!language) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy ngôn ngữ.');
  }
  return language;
};

/**
 * Admin: Tạo ngôn ngữ mới.
 * @param {object} langData - { languageCode, languageName, nativeName?, isActive?, displayOrder? }
 * @returns {Promise<object>}
 */
const createLanguage = async (langData) => {
  const { languageCode, languageName, nativeName, isActive, displayOrder } =
    langData;
  // Repo đã check trùng LanguageCode (PK) và LanguageName (UQ)
  const dataToSave = {
    LanguageCode: languageCode.toLowerCase(), // Chuẩn hóa code
    LanguageName: languageName,
    NativeName: nativeName,
    IsActive: isActive,
    DisplayOrder: displayOrder,
  };
  return languageRepository.createLanguage(dataToSave);
};

/**
 * Admin: Cập nhật thông tin ngôn ngữ.
 * @param {string} languageCode
 * @param {object} updateData - { languageName?, nativeName?, isActive?, displayOrder? }
 * @returns {Promise<object>}
 */
const updateLanguage = async (languageCode, updateData) => {
  const code = languageCode.toLowerCase();
  await getLanguageByCode(code); // Check existence

  const dataToUpdate = { ...updateData };
  // Loại bỏ các trường không được phép sửa trực tiếp hoặc không có giá trị
  delete dataToUpdate.languageCode; // Không cho sửa PK

  if (Object.keys(dataToUpdate).length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Không có thông tin để cập nhật.'
    );
  }

  const updatedLanguage = await languageRepository.updateLanguage(
    code,
    dataToUpdate
  );
  if (!updatedLanguage && Object.keys(dataToUpdate).length > 0) {
    // Nếu có gửi data mà repo trả về null (ko có dòng nào update)
    return getLanguageByCode(code); // Trả về data hiện tại
  }
  return updatedLanguage;
};

/**
 * Admin: Xóa ngôn ngữ.
 * @param {string} languageCode
 * @returns {Promise<void>}
 */
const deleteLanguage = async (languageCode) => {
  const code = languageCode.toLowerCase();
  await getLanguageByCode(code); // Check existence
  // Repository sẽ xử lý lỗi FK nếu ngôn ngữ đang được dùng
  const deletedCount = await languageRepository.deleteLanguage(code);
  if (deletedCount === 0) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Xóa ngôn ngữ thất bại.'
    );
  }
  logger.info(`Language ${code} deleted by admin.`);
};

module.exports = {
  getLanguages,
  getLanguageByCode,
  createLanguage,
  updateLanguage,
  deleteLanguage,
};
