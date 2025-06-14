const httpStatus = require('http-status').status;
const ApiError = require('../../core/errors/ApiError');

const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');

/**
 * Thêm phụ đề mới cho bài học.
 * @param {object} subtitleData - { LessonID, LanguageCode, LanguageName, SubtitleUrl, IsDefault }
 * @param {object} [transaction=null]
 * @returns {Promise<object>}
 */
const addSubtitle = async (subtitleData, transaction = null) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  try {
    executor.input('LessonID', sql.BigInt, subtitleData.LessonID);
    executor.input('LanguageCode', sql.VarChar(10), subtitleData.LanguageCode);
    executor.input(
      'SubtitleUrl',
      sql.VarChar(sql.MAX),
      subtitleData.SubtitleUrl
    );
    executor.input('IsDefault', sql.Bit, subtitleData.IsDefault || 0);

    const result = await executor.query(`
          INSERT INTO LessonSubtitles (LessonID, LanguageCode, SubtitleUrl, IsDefault)
          OUTPUT Inserted.*
          VALUES (@LessonID, @LanguageCode, @SubtitleUrl, @IsDefault);
      `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error adding subtitle:', error);
    if (error.number === 2627 || error.number === 2601) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Subtitle for language '${subtitleData.LanguageCode}' already exists.`
      );
    }
    throw error;
  }
};

/**
 * Lấy danh sách phụ đề của một bài học.
 * @param {number} lessonId
 * @returns {Promise<Array<object>>}
 */
const findSubtitlesByLessonId = async (lessonId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('LessonID', sql.BigInt, lessonId);
    const result = await request.query(`
    SELECT
        ls.SubtitleID, ls.LessonID, ls.LanguageCode,
        l.LanguageName, l.NativeName,
        ls.SubtitleUrl, ls.IsDefault, ls.UploadedAt
    FROM LessonSubtitles ls
    JOIN Languages l ON ls.LanguageCode = l.LanguageCode
    WHERE ls.LessonID = @LessonID
    ORDER BY ls.IsDefault DESC, l.LanguageName ASC;
`);
    return result.recordset;
  } catch (error) {
    logger.error(`Error finding subtitles for lesson ${lessonId}:`, error);
    throw error;
  }
};

/**
 * Tìm phụ đề bằng ID.
 * @param {number} subtitleId
 * @returns {Promise<object|null>}
 */
const findSubtitleById = async (subtitleId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('SubtitleID', sql.Int, subtitleId);
    const result = await request.query(
      'SELECT * FROM LessonSubtitles WHERE SubtitleID = @SubtitleID;'
    );

    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error finding subtitle by ID ${subtitleId}:`, error);
    throw error;
  }
};

/**
 * Xóa phụ đề bằng ID.
 * @param {number} subtitleId
 * @returns {Promise<number>}
 */
const deleteSubtitleById = async (subtitleId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('SubtitleID', sql.Int, subtitleId);
    const result = await request.query(
      'DELETE FROM LessonSubtitles WHERE SubtitleID = @SubtitleID'
    );
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error deleting subtitle ${subtitleId}:`, error);
    throw error;
  }
};

/**
 * Đặt phụ đề làm mặc định (isDefault = true).
 * Nếu `subtitleId = 0`, tắt tất cả `isDefault` cho lesson.
 * @param {number} lessonId
 * @param {number} subtitleId
 * @param {sql.Transaction} [transaction]
 * @returns {Promise<object|null>}
 */
const setPrimarySubtitle = async (lessonId, subtitleId, transaction = null) => {
  const pool = await getConnection();
  const request = transaction ? transaction.request() : pool.request();

  request.input('LessonID', sql.BigInt, lessonId);
  request.input('SubtitleID', sql.BigInt, subtitleId);

  await request.query(`
    UPDATE LessonSubtitles
    SET IsDefault = 0
    WHERE LessonID = @LessonID;
  `);

  if (subtitleId === 0) {
    return null;
  }

  const result = await request.query(`
    UPDATE LessonSubtitles
    SET IsDefault = 1
    OUTPUT INSERTED.*
    WHERE LessonID = @LessonID AND SubtitleID = @SubtitleID;
  `);

  return result.recordset[0] || null;
};

/**
 * Lấy tất cả subtitles cho một danh sách Lesson IDs.
 * @param {Array<number>} lessonIds
 * @param {object} [transaction=null]
 * @returns {Promise<Array<object>>} - Mảng Subtitle object.
 */
const findSubtitlesByLessonIds = async (lessonIds, transaction = null) => {
  if (!lessonIds || lessonIds.length === 0) return [];
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  const idPlaceholders = lessonIds
    .map((_, index) => `@lId_sub_${index}`)
    .join(',');
  lessonIds.forEach((id, index) =>
    executor.input(`lId_sub_${index}`, sql.BigInt, id)
  );

  try {
    const result = await executor.query(`
      SELECT 
        ls.SubtitleID, 
        ls.LessonID, 
        ls.LanguageCode, 
        l.LanguageName, 
        l.NativeName, 
        ls.SubtitleUrl, 
        ls.IsDefault, 
        ls.UploadedAt
      FROM LessonSubtitles ls
      JOIN Languages l ON ls.LanguageCode = l.LanguageCode
      WHERE ls.LessonID IN (${idPlaceholders})
      ORDER BY ls.LessonID, ls.IsDefault DESC, l.LanguageName ASC;
    `);
    return result.recordset;
  } catch (error) {
    logger.error(
      `Error fetching subtitles for lessons ${lessonIds.join(', ')}:`,
      error
    );
    throw error;
  }
};

/**
 * Xóa nhiều subtitle bằng IDs.
 * @param {Array<number>} subtitleIds
 * @param {object} transaction
 * @returns {Promise<number>}
 */
const deleteSubtitlesByIds = async (subtitleIds, transaction) => {
  if (!subtitleIds || subtitleIds.length === 0) return 0;
  const request = transaction.request();
  const idPlaceholders = subtitleIds
    .map((_, index) => `@id_sub_del_${index}`)
    .join(',');
  subtitleIds.forEach((id, index) =>
    request.input(`id_sub_del_${index}`, sql.Int, id)
  );
  try {
    const result = await request.query(
      `DELETE FROM LessonSubtitles WHERE SubtitleID IN (${idPlaceholders});`
    );
    logger.info(`Deleted ${result.rowsAffected[0]} subtitles.`);
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(
      `Error bulk deleting subtitles: ${subtitleIds.join(', ')}`,
      error
    );
    throw error;
  }
};

/**
 * Đếm số lượng phụ đề của một bài học.
 * @param {number} lessonId
 * @returns {Promise<number>}
 */
const countSubtitlesByLessonId = async (lessonId, transaction = null) => {
  try {
    const executor = transaction
      ? transaction.request()
      : (await getConnection()).request();
    executor.input('LessonID', sql.BigInt, lessonId);
    const result = await executor.query(
      'SELECT COUNT(*) AS count FROM LessonSubtitles WHERE LessonID = @LessonID;'
    );
    return result.recordset[0]?.count || 0;
  } catch (error) {
    logger.error(`Error counting subtitles for lesson ${lessonId}:`, error);
    throw error;
  }
};

/**
 * Xóa tất cả subtitles của một bài học.
 * @param {number} lessonId
 * @param {object} transaction
 * @returns {Promise<number>}
 */
const deleteSubtitlesByLessonId = async (lessonId, transaction) => {
  if (!lessonId) return 0;
  const request = transaction.request();
  request.input('LessonID', sql.BigInt, lessonId);
  try {
    // TODO: Nếu subtitle lưu trên cloud, cần lấy thông tin file trước khi xóa
    const result = await request.query(`
      DELETE FROM LessonSubtitles WHERE LessonID = @LessonID;
    `);
    logger.info(
      `Deleted ${result.rowsAffected[0]} subtitles for lesson ${lessonId}.`
    );

    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error deleting subtitles for lesson ${lessonId}:`, error);
    throw error;
  }
};

module.exports = {
  addSubtitle,
  findSubtitlesByLessonId,
  findSubtitleById,
  deleteSubtitleById,
  setPrimarySubtitle,
  findSubtitlesByLessonIds,
  deleteSubtitlesByIds,
  countSubtitlesByLessonId,
  deleteSubtitlesByLessonId,
};
