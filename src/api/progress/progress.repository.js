const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');

/**
 * Tìm hoặc tạo bản ghi tiến độ (Upsert).
 * Nếu bản ghi đã tồn tại, trả về nó. Nếu chưa, tạo mới và trả về.
 * @param {number} accountId
 * @param {number} lessonId
 * @param {object} [defaults={}] - Giá trị mặc định nếu tạo mới (vd: IsCompleted=0).
 * @param {object} [transaction=null] - Transaction nếu có.
 * @returns {Promise<object>} - Bản ghi LessonProgress.
 */
const findOrCreateProgress = async (
  accountId,
  lessonId,
  defaults = {},
  transaction = null
) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('AccountID', sql.BigInt, accountId);
  executor.input('LessonID', sql.BigInt, lessonId);

  try {
    // Thử tìm trước
    let result = await executor.query(`
            SELECT * FROM LessonProgress WHERE AccountID = @AccountID AND LessonID = @LessonID;
        `);

    if (result.recordset.length > 0) {
      return result.recordset[0]; // Trả về nếu đã tồn tại
    }
    // Nếu không tồn tại, tạo mới
    // Reset executor để thêm input mới (hoặc dùng request mới từ transaction/pool)
    const createExecutor = transaction
      ? transaction.request()
      : (await getConnection()).request();
    createExecutor.input('AccountID', sql.BigInt, accountId);
    createExecutor.input('LessonID', sql.BigInt, lessonId);
    createExecutor.input('IsCompleted', sql.Bit, defaults.IsCompleted || 0);
    createExecutor.input(
      'LastWatchedPosition',
      sql.Int,
      defaults.LastWatchedPosition || null
    );

    result = await createExecutor.query(`
                INSERT INTO LessonProgress (AccountID, LessonID, IsCompleted, LastWatchedPosition, LastWatchedAt)
                OUTPUT Inserted.*
                VALUES (@AccountID, @LessonID, @IsCompleted, @LastWatchedPosition, GETDATE());
            `);
    if (result.recordset.length > 0) {
      return result.recordset[0];
    }
    // Lỗi không mong muốn khi insert không trả về output
    throw new Error('Failed to create lesson progress record.');
  } catch (error) {
    // Xử lý lỗi unique constraint nếu có race condition khi tạo mới
    if (error.number === 2627 || error.number === 2601) {
      logger.warn(
        `Race condition detected during findOrCreateProgress for Account=${accountId}, Lesson=${lessonId}. Retrying find.`
      );
      // Thử tìm lại một lần nữa
      const retryExecutor = transaction
        ? transaction.request()
        : (await getConnection()).request();
      retryExecutor.input('AccountID', sql.BigInt, accountId);
      retryExecutor.input('LessonID', sql.BigInt, lessonId);
      const retryResult = await retryExecutor.query(
        `SELECT * FROM LessonProgress WHERE AccountID = @AccountID AND LessonID = @LessonID;`
      );
      if (retryResult.recordset[0]) return retryResult.recordset[0];
      throw error; // Ném lỗi gốc nếu vẫn không tìm thấy
    }
    logger.error(
      `Error in findOrCreateProgress for Account=${accountId}, Lesson=${lessonId}:`,
      error
    );
    throw error;
  }
};

/**
 * Cập nhật bản ghi tiến độ.
 * @param {number} progressId - ID của bản ghi LessonProgress.
 * @param {object} updateData - { IsCompleted, CompletedAt, LastWatchedPosition, LastWatchedAt }.
 * @param {object} [transaction=null] - Transaction nếu có.
 * @returns {Promise<object>} - Bản ghi đã cập nhật.
 */
const updateProgressById = async (
  progressId,
  updateData,
  transaction = null
) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('ProgressID', sql.BigInt, progressId);
  executor.input('LastWatchedAt', sql.DateTime2, new Date()); // Luôn cập nhật LastWatchedAt

  const setClauses = ['LastWatchedAt = @LastWatchedAt'];
  if (updateData.IsCompleted !== undefined) {
    executor.input('IsCompleted', sql.Bit, updateData.IsCompleted);
    setClauses.push('IsCompleted = @IsCompleted');
    if (updateData.IsCompleted && updateData.CompletedAt === undefined) {
      // Tự động set CompletedAt nếu IsCompleted=true và CompletedAt chưa được cung cấp
      executor.input('CompletedAt', sql.DateTime2, new Date());
      setClauses.push('CompletedAt = @CompletedAt');
    } else if (updateData.CompletedAt !== undefined) {
      // Nếu CompletedAt được cung cấp
      executor.input('CompletedAt', sql.DateTime2, updateData.CompletedAt);
      setClauses.push('CompletedAt = @CompletedAt');
    } else if (!updateData.IsCompleted) {
      // Nếu đánh dấu chưa hoàn thành, xóa CompletedAt
      executor.input('CompletedAt', sql.DateTime2, null);
      setClauses.push('CompletedAt = @CompletedAt');
    }
  }
  if (updateData.LastWatchedPosition !== undefined) {
    executor.input(
      'LastWatchedPosition',
      sql.Int,
      updateData.LastWatchedPosition
    );
    setClauses.push('LastWatchedPosition = @LastWatchedPosition');
  }

  if (setClauses.length === 1) return null; // Không có gì thay đổi ngoài LastWatchedAt

  const query = `
        UPDATE LessonProgress
        SET ${setClauses.join(', ')}
        OUTPUT Inserted.*
        WHERE ProgressID = @ProgressID;
    `;

  try {
    const result = await executor.query(query);
    return result.recordset[0];
  } catch (error) {
    logger.error(`Error updating progress ${progressId}:`, error);
    throw error;
  }
};

/**
 * Lấy tất cả tiến độ của người dùng trong một khóa học.
 * @param {number} accountId
 * @param {number} courseId
 * @returns {Promise<object[]>} - Mảng các bản ghi LessonProgress.
 */
const findAllProgressInCourse = async (accountId, courseId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, accountId);
    request.input('CourseID', sql.BigInt, courseId);

    const result = await request.query(`
            SELECT lp.*
            FROM LessonProgress lp
            JOIN Lessons l ON lp.LessonID = l.LessonID
            JOIN Sections s ON l.SectionID = s.SectionID
            WHERE lp.AccountID = @AccountID AND s.CourseID = @CourseID;
        `);
    return result.recordset;
  } catch (error) {
    logger.error(
      `Error finding all progress for user ${accountId}, course ${courseId}:`,
      error
    );
    throw error;
  }
};

/**
 * Đếm số bài học đã hoàn thành của người dùng trong khóa học.
 * @param {number} accountId
 * @param {number} courseId
 * @returns {Promise<number>}
 */
const countCompletedLessonsInCourse = async (accountId, courseId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, accountId);
    request.input('CourseID', sql.BigInt, courseId);

    const result = await request.query(`
            SELECT COUNT(lp.ProgressID) as completedCount
            FROM LessonProgress lp
            JOIN Lessons l ON lp.LessonID = l.LessonID
            JOIN Sections s ON l.SectionID = s.SectionID
            WHERE lp.AccountID = @AccountID AND s.CourseID = @CourseID AND lp.IsCompleted = 1;
        `);
    return result.recordset[0].completedCount;
  } catch (error) {
    logger.error(
      `Error counting completed lessons for user ${accountId}, course ${courseId}:`,
      error
    );
    throw error;
  }
};

/**
 * Đếm tổng số bài học trong khóa học (không tính quiz?).
 * @param {number} courseId
 * @returns {Promise<number>}
 */
const countTotalLessonsInCourse = async (courseId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CourseID', sql.BigInt, courseId);
    // Có thể loại trừ LessonType='QUIZ' nếu không tính vào tiến độ %
    request.input('QuizType', sql.VarChar, 'QUIZ');
    const result = await request.query(`
            SELECT COUNT(l.LessonID) as totalCount
            FROM Lessons l
            JOIN Sections s ON l.SectionID = s.SectionID
            WHERE s.CourseID = @CourseID -- AND l.LessonType != @QuizType;
        `);
    return result.recordset[0].totalCount;
  } catch (error) {
    logger.error(`Error counting total lessons for course ${courseId}:`, error);
    throw error;
  }
};

module.exports = {
  findOrCreateProgress,
  updateProgressById,
  findAllProgressInCourse,
  countCompletedLessonsInCourse,
  countTotalLessonsInCourse,
};
