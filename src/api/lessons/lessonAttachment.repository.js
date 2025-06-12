const httpStatus = require('http-status').status;
const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');
const ApiError = require('../../core/errors/ApiError');

/**
 * Tạo bản ghi attachment mới (chỉ metadata).
 * URL và CloudStorageID thường được cập nhật sau khi upload thành công.
 * @param {object} attachmentData - { LessonID, FileName, FileType, FileSize }
 * @param {object} [transaction=null]
 * @returns {Promise<object>}
 */
const createAttachment = async (attachmentData, transaction = null) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('LessonID', sql.BigInt, attachmentData.LessonID);
  executor.input('FileName', sql.NVarChar, attachmentData.FileName);
  executor.input(
    'FileURL',
    sql.VarChar,
    attachmentData.FileURL || 'pending_upload'
  );
  executor.input('FileType', sql.VarChar, attachmentData.FileType);
  executor.input('FileSize', sql.BigInt, attachmentData.FileSize);
  executor.input('CloudStorageID', sql.VarChar, null);

  try {
    const result = await executor.query(`
          INSERT INTO LessonAttachments (LessonID, FileName, FileURL, FileType, FileSize, CloudStorageID)
          OUTPUT Inserted.*
          VALUES (@LessonID, @FileName, @FileURL, @FileType, @FileSize, @CloudStorageID);
      `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error in createAttachment repository:', error);
    throw error;
  }
};

/**
 * Tìm attachment bằng ID.
 * @param {number} attachmentId
 * @returns {Promise<object|null>}
 */
const findAttachmentById = async (attachmentId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AttachmentID', sql.Int, attachmentId);
    const result = await request.query(
      'SELECT * FROM LessonAttachments WHERE AttachmentID = @AttachmentID'
    );
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error finding attachment ${attachmentId}:`, error);
    throw error;
  }
};

/**
 * Tìm attachments theo LessonID.
 * @param {number} lessonId
 * @returns {Promise<Array<object>>}
 */
const findAttachmentsByLessonId = async (lessonId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('LessonID', sql.BigInt, lessonId);
    const result = await request.query(
      'SELECT * FROM LessonAttachments WHERE LessonID = @LessonID ORDER BY UploadedAt ASC'
    );
    return result.recordset;
  } catch (error) {
    logger.error(`Error finding attachments for lesson ${lessonId}:`, error);
    throw error;
  }
};

/**
 * Xóa attachment theo ID.
 * @param {number} attachmentId
 * @returns {Promise<number>}
 */
const deleteAttachmentById = async (attachmentId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AttachmentID', sql.Int, attachmentId);
    const result = await request.query(
      'DELETE FROM LessonAttachments WHERE AttachmentID = @AttachmentID'
    );
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error deleting attachment ${attachmentId} from DB:`, error);
    throw error;
  }
};

/**
 * Lấy tất cả attachments cho một danh sách Lesson IDs.
 * @param {Array<number>} lessonIds
 * @param {object} [transaction=null]
 * @returns {Promise<Array<object>>} - Mảng các Attachment object.
 */
const findAttachmentsByLessonIds = async (lessonIds, transaction = null) => {
  if (!lessonIds || lessonIds.length === 0) return [];
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  const idPlaceholders = lessonIds
    .map((_, index) => `@lId_att_${index}`)
    .join(',');
  lessonIds.forEach((id, index) =>
    executor.input(`lId_att_${index}`, sql.BigInt, id)
  );

  try {
    const result = await executor.query(`
          SELECT * FROM LessonAttachments
          WHERE LessonID IN (${idPlaceholders})
          ORDER BY LessonID, UploadedAt ASC;
      `);
    return result.recordset;
  } catch (error) {
    logger.error(
      `Error fetching attachments for lessons ${lessonIds.join(', ')}:`,
      error
    );
    throw error;
  }
};

/**
 * Xóa nhiều attachment bằng IDs.
 * **Lưu ý:** Hàm này chỉ xóa record DB. Việc xóa file trên Cloudinary cần xử lý riêng (trong service hoặc job).
 * @param {Array<number>} attachmentIds
 * @param {object} transaction
 * @returns {Promise<number>}
 */
const deleteAttachmentsByIds = async (attachmentIds, transaction) => {
  if (!attachmentIds || attachmentIds.length === 0) return 0;
  const request = transaction.request();
  const idPlaceholders = attachmentIds
    .map((_, index) => `@id_att_del_${index}`)
    .join(',');
  attachmentIds.forEach((id, index) =>
    request.input(`id_att_del_${index}`, sql.Int, id)
  );
  try {
    const filesToDeleteResult = await request.query(
      `SELECT AttachmentID, CloudStorageID FROM LessonAttachments WHERE AttachmentID IN (${idPlaceholders}) AND CloudStorageID IS NOT NULL;`
    );
    const filesToDelete = filesToDeleteResult.recordset;

    const deleteResult = await request.query(
      `DELETE FROM LessonAttachments WHERE AttachmentID IN (${idPlaceholders});`
    );
    logger.info(
      `Deleted ${deleteResult.rowsAffected[0]} attachment records from DB.`
    );

    return { deletedCount: deleteResult.rowsAffected[0], filesToDelete };
  } catch (error) {
    logger.error(
      `Error bulk deleting attachments from DB: ${attachmentIds.join(', ')}`,
      error
    );
    throw error;
  }
};

module.exports = {
  createAttachment,
  findAttachmentById,
  findAttachmentsByLessonId,
  deleteAttachmentById,
  findAttachmentsByLessonIds,
  deleteAttachmentsByIds,
};
