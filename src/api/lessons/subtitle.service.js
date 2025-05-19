// src/api/lessons/subtitle.service.js
const httpStatus = require('http-status');
const subtitleRepository = require('./subtitle.repository');
const lessonRepository = require('./lessons.repository'); // Check lesson tồn tại
const { checkCourseAccess } = require('../sections/sections.service'); // Check quyền course
const ApiError = require('../../core/errors/ApiError');
const logger = require('../../utils/logger');
const { getConnection, sql } = require('../../database/connection'); // Cho transaction
const { toCamelCaseObject } = require('../../utils/caseConverter');
const languageRepository = require('../languages/languages.repository');
// Có thể dùng thư viện để lấy tên ngôn ngữ từ code
// const { getName } = require('iso-639-1');

/**
 * Lấy danh sách phụ đề cho một bài học.
 * @param {number} lessonId
 * @param {object} user - User hiện tại (để check quyền xem lesson).
 * @returns {Promise<Array<object>>}
 */
const getSubtitles = async (lessonId, user) => {
  const lesson = await lessonRepository.findLessonById(lessonId);
  if (!lesson)
    throw new ApiError(httpStatus.NOT_FOUND, 'Bài học không tồn tại.');

  // Kiểm tra quyền xem bài học (tương tự như khi lấy video URL)
  // await checkLessonAccess(lesson, user); // Cần hàm checkLessonAccess riêng hoặc dùng logic enroll/owner/admin

  return subtitleRepository.findSubtitlesByLessonId(lessonId);
};

/**
 * Instructor thêm phụ đề mới.
 * @param {number} lessonId
 * @param {object} subtitleData - { languageCode, subtitleUrl, isDefault }
 * @param {object} user - Instructor/Admin.
 * @returns {Promise<object>} - Phụ đề mới.
 */
const addSubtitle = async (lessonId, subtitleData, user) => {
  const lesson = await lessonRepository.findLessonById(lessonId);
  if (!lesson)
    throw new ApiError(httpStatus.NOT_FOUND, 'Bài học không tồn tại.');
  await checkCourseAccess(lesson.CourseID, user, 'thêm phụ đề'); // Check quyền sửa khóa học

  const { languageCode, subtitleUrl, isDefault } = subtitleData;

  const langRecord = await languageRepository.findLanguageByCode(
    languageCode.toLowerCase()
  );
  if (!langRecord || !langRecord.IsActive) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Mã ngôn ngữ '${languageCode}' không hợp lệ hoặc không được kích hoạt.`
    );
  }
  const languageName = langRecord.LanguageName; // Lấy tên từ DB

  const dataToSave = {
    LessonID: lessonId,
    LanguageCode: languageCode.toLowerCase(),
    LanguageName: languageName, // *** Dùng tên đã lấy ***
    SubtitleUrl: subtitleUrl,
    IsDefault: !!isDefault,
  };

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // Nếu đặt làm primary, bỏ primary cũ trước
    if (dataToSave.IsDefault) {
      await subtitleRepository.setPrimarySubtitle(lessonId, 0, transaction); // Bỏ hết primary cũ
    }

    const newSubtitle = await subtitleRepository.addSubtitle(
      dataToSave,
      transaction
    );

    // Nếu vừa thêm và đặt làm primary, cập nhật lại chính nó
    if (dataToSave.IsDefault) {
      await subtitleRepository.setPrimarySubtitle(
        lessonId,
        newSubtitle.SubtitleID,
        transaction
      );
      newSubtitle.IsDefault = true; // Cập nhật lại trạng thái trả về
    }

    await transaction.commit();
    return toCamelCaseObject(newSubtitle);
  } catch (error) {
    await transaction.rollback();
    logger.error(`Error adding subtitle for lesson ${lessonId}:`, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Thêm phụ đề thất bại.'
    );
  }
};

/**
 * Instructor đặt phụ đề làm mặc định.
 * @param {number} lessonId
 * @param {number} subtitleId
 * @param {object} user
 * @returns {Promise<object>} - Phụ đề đã được cập nhật.
 */
const setPrimarySubtitle = async (lessonId, subtitleId, user) => {
  const lesson = await lessonRepository.findLessonById(lessonId);
  if (!lesson) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Bài học không tồn tại.');
  }
  await checkCourseAccess(lesson.CourseID, user, 'cập nhật phụ đề');

  const subtitle = await subtitleRepository.findSubtitleById(subtitleId);

  if (!subtitle || Number(subtitle.LessonID) !== lessonId) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Phụ đề không tồn tại hoặc không thuộc bài học này.'
    );
  }

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // Tắt `isDefault` cho phụ đề cũ (nếu có)
    await subtitleRepository.setPrimarySubtitle(lessonId, 0, transaction);

    // Đặt `isDefault` cho phụ đề mới
    const updatedSubtitle = await subtitleRepository.setPrimarySubtitle(
      lessonId,
      subtitleId,
      transaction
    );

    await transaction.commit();

    logger.info(`Subtitle ${subtitleId} set as primary for lesson ${lessonId}`);
    return toCamelCaseObject(updatedSubtitle); // Trả về phụ đề đã cập nhật
  } catch (error) {
    await transaction.rollback();
    logger.error(`Error setting primary subtitle ${subtitleId}:`, error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Đặt phụ đề chính thất bại.'
    );
  }
};

/**
 * Instructor xóa phụ đề.
 * @param {number} lessonId
 * @param {number} subtitleId
 * @param {object} user
 * @returns {Promise<void>}
 */
const deleteSubtitle = async (lessonId, subtitleId, user) => {
  const lesson = await lessonRepository.findLessonById(lessonId);
  if (!lesson)
    throw new ApiError(httpStatus.NOT_FOUND, 'Bài học không tồn tại.');
  await checkCourseAccess(lesson.CourseID, user, 'xóa phụ đề');

  const subtitle = await subtitleRepository.findSubtitleById(subtitleId);
  if (!subtitle || Number(subtitle.LessonID) !== lessonId) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Phụ đề không tồn tại hoặc không thuộc bài học này.'
    );
  }

  // TODO: Nếu xóa phụ đề private trên Cloudinary, cần gọi deleteAsset ở đây

  const deletedCount = await subtitleRepository.deleteSubtitleById(subtitleId);
  if (deletedCount === 0) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Xóa phụ đề thất bại.'
    );
  }
  logger.info(`Subtitle ${subtitleId} deleted for lesson ${lessonId}`);

  // Nếu xóa phụ đề mặc định, cần chọn cái khác làm mặc định? (Tùy logic)
};

module.exports = {
  getSubtitles,
  addSubtitle,
  setPrimarySubtitle,
  deleteSubtitle,
  // Thêm updateSubtitle nếu cần sửa URL/Name
};
