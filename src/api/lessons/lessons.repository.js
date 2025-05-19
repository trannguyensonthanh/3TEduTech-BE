const httpStatus = require('http-status').status;
const ApiError = require('../../core/errors/ApiError');
const { getConnection, sql } = require('../../database/connection');
const { toPascalCaseObject } = require('../../utils/caseConverter');
const logger = require('../../utils/logger');
const quizRepository = require('../quizzes/quizzes.repository');
const attachmentRepository = require('./lessonAttachment.repository');
const subtitleRepository = require('./subtitle.repository'); // *** Import subtitle repository ***

/**
 * Lấy thứ tự lesson lớn nhất hiện tại của một section.
 * @param {number} sectionId
 * @param {object} [transaction=null] - Transaction nếu có.
 * @returns {Promise<number>} - Thứ tự lớn nhất, hoặc -1 nếu chưa có lesson nào.
 */
const getMaxLessonOrder = async (sectionId, transaction = null) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('SectionID', sql.BigInt, sectionId);
  try {
    const result = await executor.query(
      'SELECT MAX(LessonOrder) as maxOrder FROM Lessons WHERE SectionID = @SectionID'
    );
    return result.recordset[0].maxOrder === null
      ? -1
      : result.recordset[0].maxOrder;
  } catch (error) {
    logger.error(
      `Error getting max lesson order for section ${sectionId}:`,
      error
    );
    throw error;
  }
};

/**
 * Tạo lesson mới với cấu trúc video source mới.
 * @param {object} lessonData - Dữ liệu lesson bao gồm các trường mới.
 * @param {object} [transaction=null] - Transaction nếu có.
 * @returns {Promise<object>} - Lesson vừa tạo.
 */
const createLesson = async (lessonData, transaction = null) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();

  // *** INPUT các trường cơ bản và trường mới ***
  executor.input('SectionID', sql.BigInt, lessonData.SectionID);
  executor.input('LessonName', sql.NVarChar, lessonData.LessonName);
  executor.input('Description', sql.NVarChar, lessonData.Description); // Cho phép NULL
  executor.input('LessonOrder', sql.Int, lessonData.LessonOrder);
  executor.input('LessonType', sql.VarChar, lessonData.LessonType);
  executor.input('VideoSourceType', sql.VarChar, lessonData.VideoSourceType); // *** Cột mới, có thể NULL ***
  executor.input('ExternalVideoID', sql.VarChar, lessonData.ExternalVideoID); // *** Cột tái sử dụng, có thể NULL ***
  executor.input('ThumbnailUrl', sql.VarChar, lessonData.ThumbnailUrl); // Giữ lại ThumbnailUrl
  executor.input(
    'VideoDurationSeconds',
    sql.Int,
    lessonData.VideoDurationSeconds
  ); // Có thể NULL
  executor.input('TextContent', sql.NVarChar, lessonData.TextContent); // Có thể NULL
  executor.input('IsFreePreview', sql.Bit, lessonData.IsFreePreview || false);
  // Bỏ các trường VideoUrl, VideoPublicId

  try {
    // *** Câu lệnh INSERT đã cập nhật ***
    const result = await executor.query(`
          INSERT INTO Lessons (
              SectionID, LessonName, Description, LessonOrder, LessonType,
              VideoSourceType, ExternalVideoID, ThumbnailUrl, VideoDurationSeconds,
              TextContent, IsFreePreview
              -- Không còn VideoUrl, VideoPublicId
          )
          OUTPUT Inserted.*
          VALUES (
              @SectionID, @LessonName, @Description, @LessonOrder, @LessonType,
              @VideoSourceType, @ExternalVideoID, @ThumbnailUrl, @VideoDurationSeconds,
              @TextContent, @IsFreePreview
          );
      `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error in createLesson repository:', error);
    // Kiểm tra lỗi FK nếu cần
    if (
      error.number === 547 &&
      error.message.includes('FK_Lessons_SectionID')
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Section ID ${lessonData.SectionID} không hợp lệ.`
      );
    }
    throw error; // Ném lại lỗi khác
  }
};

/**
 * Tìm lesson bằng ID, bao gồm questions, attachments, và subtitles.
 * @param {number} lessonId
 * @returns {Promise<object|null>}
 */
const findLessonById = async (lessonId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('LessonID', sql.BigInt, lessonId);

    // Lấy thông tin cơ bản của lesson, section, và course
    const lessonResult = await request.query(`
      SELECT l.*, s.CourseID, c.InstructorID, c.StatusID as CourseStatusID
      FROM Lessons l
      JOIN Sections s ON l.SectionID = s.SectionID
      JOIN Courses c ON s.CourseID = c.CourseID
      WHERE l.LessonID = @LessonID;
    `);

    const lesson = lessonResult.recordset[0];
    if (!lesson) {
      return null; // Không tìm thấy lesson
    }

    // Lấy danh sách questions và options liên quan
    const questionsResult = await request.query(`
      SELECT q.QuestionID, q.QuestionText, q.Explanation, q.QuestionOrder,
             o.OptionID, o.OptionText, o.IsCorrectAnswer, o.OptionOrder
      FROM QuizQuestions q
      LEFT JOIN QuizOptions o ON q.QuestionID = o.QuestionID
      WHERE q.LessonID = @LessonID
      ORDER BY q.QuestionOrder ASC, o.OptionOrder ASC;
    `);

    const questionsMap = new Map();
    questionsResult.recordset.forEach((row) => {
      if (!questionsMap.has(row.QuestionID)) {
        questionsMap.set(row.QuestionID, {
          questionId: row.QuestionID,
          questionText: row.QuestionText,
          explanation: row.Explanation,
          questionOrder: row.QuestionOrder,
          options: [],
        });
      }
      if (row.OptionID) {
        questionsMap.get(row.QuestionID).options.push({
          optionId: row.OptionID,
          optionText: row.OptionText,
          isCorrectAnswer: row.IsCorrectAnswer,
          optionOrder: row.OptionOrder,
        });
      }
    });

    // Lấy danh sách attachments liên quan
    const attachmentsResult = await request.query(`
      SELECT AttachmentID, FileName, FileURL, FileType, FileSize, UploadedAt
      FROM LessonAttachments
      WHERE LessonID = @LessonID
      ORDER BY UploadedAt ASC;
    `);

    const attachments = attachmentsResult.recordset.map((attachment) => ({
      attachmentId: attachment.AttachmentID,
      fileName: attachment.FileName,
      fileUrl: attachment.FileURL,
      fileType: attachment.FileType,
      fileSize: attachment.FileSize,
      uploadedAt: attachment.UploadedAt,
    }));

    // Lấy danh sách subtitles liên quan
    const subtitlesResult = await request.query(`
  SELECT 
    ls.SubtitleID, 
    ls.LanguageCode, 
    l.LanguageName, 
    l.NativeName, 
    ls.SubtitleUrl, 
    ls.IsDefault, 
    ls.UploadedAt
  FROM LessonSubtitles ls
  JOIN Languages l ON ls.LanguageCode = l.LanguageCode
  WHERE ls.LessonID = @LessonID
  ORDER BY ls.IsDefault DESC, l.LanguageName ASC;
`);
    const subtitles = subtitlesResult.recordset.map((subtitle) => ({
      subtitleId: subtitle.SubtitleID,
      languageCode: subtitle.LanguageCode,
      languageName: subtitle.LanguageName,
      subtitleUrl: subtitle.SubtitleUrl,
      isDefault: subtitle.IsDefault,
      uploadedAt: subtitle.UploadedAt,
    }));

    // Lồng các dữ liệu con vào lesson
    return {
      ...lesson,
      questions: Array.from(questionsMap.values()),
      attachments,
      subtitles,
    };
  } catch (error) {
    logger.error(`Error in findLessonById (${lessonId}):`, error);
    throw error;
  }
};

/**
 * Lấy tất cả lessons của một section (theo thứ tự) - Bỏ cột cũ.
 * @param {number} sectionId
 * @returns {Promise<object[]>} - Mảng các lesson.
 */
const findLessonsBySectionId = async (sectionId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('SectionID', sql.BigInt, sectionId);
    const result = await request.query(`
          SELECT
              LessonID, SectionID, LessonName, Description, LessonOrder, LessonType,
              VideoSourceType, ExternalVideoID, ThumbnailUrl, VideoDurationSeconds,
              TextContent, IsFreePreview, OriginalID, CreatedAt, UpdatedAt
              -- Bỏ VideoUrl, VideoPublicId
          FROM Lessons
          WHERE SectionID = @SectionID
          ORDER BY LessonOrder ASC;
      `);
    return result.recordset;
  } catch (error) {
    logger.error(`Error finding lessons for section ${sectionId}:`, error);
    throw error;
  }
};

/**
 * Cập nhật lesson bằng ID với cấu trúc video source mới.
 * @param {number} lessonId
 * @param {object} updateData - Dữ liệu cập nhật (có thể chứa các trường mới).
 * @param {object} [transaction=null] - Transaction nếu có.
 * @returns {Promise<object|null>} - Lesson đã cập nhật hoặc null nếu không có gì thay đổi.
 */
const updateLessonById = async (lessonId, updateData, transaction = null) => {
  const updateDatatoPascalCaseObject = toPascalCaseObject(updateData);

  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('LessonID', sql.BigInt, lessonId);
  executor.input('UpdatedAt', sql.DateTime2, new Date());

  const setClauses = ['UpdatedAt = @UpdatedAt'];

  // Duyệt qua các key trong updateData để tạo câu lệnh SET và input params
  for (const key in updateDatatoPascalCaseObject) {
    if (
      Object.hasOwnProperty.call(updateDatatoPascalCaseObject, key) &&
      key !== 'LessonID' &&
      key !== 'SectionID' &&
      key !== 'CreatedAt'
    ) {
      const value = updateDatatoPascalCaseObject[key];
      let dbKey = key; // Tên cột trong DB (có thể khác key trong object)
      let sqlType;

      // Xác định tên cột và kiểu dữ liệu
      switch (key) {
        case 'LessonName':
          dbKey = 'LessonName';
          sqlType = sql.NVarChar;
          break;
        case 'Description':
          dbKey = 'Description';
          sqlType = sql.NVarChar;
          break;
        case 'LessonOrder':
          dbKey = 'LessonOrder';
          sqlType = sql.Int;
          break;
        case 'LessonType':
          dbKey = 'LessonType';
          sqlType = sql.VarChar;
          break;
        case 'VideoSourceType':
          dbKey = 'VideoSourceType';
          sqlType = sql.VarChar;
          break; // *** Thêm ***
        case 'ExternalVideoID':
          dbKey = 'ExternalVideoID';
          sqlType = sql.VarChar;
          break; // *** Dùng ExternalVideoID ***
        case 'ThumbnailUrl':
          dbKey = 'ThumbnailUrl';
          sqlType = sql.VarChar;
          break;
        case 'VideoDurationSeconds':
          dbKey = 'VideoDurationSeconds';
          sqlType = sql.Int;
          break;
        case 'TextContent':
          dbKey = 'TextContent';
          sqlType = sql.NVarChar;
          break;
        case 'IsFreePreview':
          dbKey = 'IsFreePreview';
          sqlType = sql.Bit;
          break;
        // case 'videoUrl': continue; // *** Bỏ qua cột cũ ***
        // case 'videoPublicId': continue; // *** Bỏ qua cột cũ ***
        default:
          continue; // Bỏ qua các key không hợp lệ hoặc không cho phép update
      }

      executor.input(key, sqlType, value); // Dùng key của updateData làm tên @param
      setClauses.push(`${dbKey} = @${key}`); // Dùng dbKey cho tên cột
    }
  }

  if (setClauses.length === 1) {
    logger.warn(
      `Update lesson ${lessonId} called with no valid fields to update.`
    );
    return null; // Không có gì thay đổi
  }

  const query = `
      UPDATE Lessons
      SET ${setClauses.join(', ')}
      OUTPUT Inserted.* -- Trả về tất cả các cột của dòng đã cập nhật
      WHERE LessonID = @LessonID;
  `;

  try {
    const result = await executor.query(query);
    if (result.recordset.length === 0) {
      // Trường hợp không tìm thấy lessonId để update (ít xảy ra nếu service đã check)
      throw new ApiError(
        httpStatus.NOT_FOUND,
        `Lesson with ID ${lessonId} not found for update.`
      );
    }
    // Trả về bản ghi đã cập nhật (loại bỏ các cột không cần thiết nếu muốn)
    const updatedLesson = result.recordset[0];
    delete updatedLesson.VideoUrl; // Đảm bảo không trả về cột đã xóa
    delete updatedLesson.VideoPublicId; // Đảm bảo không trả về cột đã xóa
    return updatedLesson;
  } catch (error) {
    logger.error(`Error updating lesson ${lessonId}:`, error);
    throw error;
  }
};

/**
 * Xóa lesson bằng ID.
 * @param {number} lessonId
 * @returns {Promise<number>} - Số dòng bị ảnh hưởng.
 */
const deleteLessonById = async (lessonId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('LessonID', sql.BigInt, lessonId);
    const result = await request.query(
      'DELETE FROM Lessons WHERE LessonID = @LessonID'
    );
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error deleting lesson ${lessonId}:`, error);
    if (error.number === 547) {
      // Có thể do LessonProgress, QuizAttempts,...
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Không thể xóa bài học vì có dữ liệu liên quan (tiến độ học, bài quiz,...).'
      );
    }
    throw error;
  }
};

/**
 * Cập nhật thứ tự cho nhiều lesson cùng lúc (trong transaction).
 * @param {Array<{id: number, order: number}>} lessonOrders - Mảng lesson và thứ tự mới.
 * @param {object} transaction - Transaction object.
 * @returns {Promise<void>}
 */
const updateLessonsOrder = async (lessonOrders, transaction) => {
  try {
    for (const item of lessonOrders) {
      const singleUpdateRequest = transaction.request();
      singleUpdateRequest.input(`LessonID_${item.id}`, sql.BigInt, item.id);
      singleUpdateRequest.input(`LessonOrder_${item.id}`, sql.Int, item.order);
      singleUpdateRequest.input(
        `UpdatedAt_${item.id}`,
        sql.DateTime2,
        new Date()
      );

      await singleUpdateRequest.query(`
        UPDATE Lessons
        SET LessonOrder = @LessonOrder_${item.id}, UpdatedAt = @UpdatedAt_${item.id}
        WHERE LessonID = @LessonID_${item.id};
      `);
    }
  } catch (error) {
    logger.error('Error updating lesson orders:', error);
    throw error;
  }
};

/**
 * Xóa nhiều lesson bằng IDs (và các bản ghi con liên quan thông qua CASCADE).
 * @param {Array<number>} lessonIds - Mảng các LessonID cần xóa.
 * @param {object} transaction - Transaction object.
 * @returns {Promise<number>} - Số lượng lesson đã xóa.
 */
const deleteLessonsByIds = async (lessonIds, transaction) => {
  if (!lessonIds || lessonIds.length === 0) return 0;

  const request = transaction.request();
  const idPlaceholders = lessonIds
    .map((_, index) => `@id_les_del_${index}`)
    .join(',');
  lessonIds.forEach((id, index) =>
    request.input(`id_les_del_${index}`, sql.BigInt, id)
  );

  try {
    const result = await request.query(`
          DELETE FROM Lessons
          WHERE LessonID IN (${idPlaceholders});
      `);
    logger.info(`Deleted ${result.rowsAffected[0]} lessons.`);
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error bulk deleting lessons: ${lessonIds.join(', ')}`, error);
    if (error.number === 547) {
      // Lỗi FK nếu CASCADE không được thiết lập đúng
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to delete related lesson data. Check FK constraints.'
      );
    }
    throw error;
  }
};

/**
 * Lấy tất cả lessons cho một danh sách Section IDs, bao gồm chi tiết con đầy đủ.
 * @param {Array<number>} sectionIds
 * @param {object} [transaction=null]
 * @returns {Promise<Array<Lesson>>} - Mảng lessons với questions(options), attachments, subtitles.
 */
const findAllLessonsWithDetailsBySectionIds = async (
  sectionIds,
  transaction = null
) => {
  if (!sectionIds || sectionIds.length === 0) return [];
  logger.debug(
    `Fetching all lessons with full details for sections: ${sectionIds.join(', ')}`
  );

  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();

  const sectionIdPlaceholders = sectionIds
    .map((_, index) => `@sId_${index}`)
    .join(',');
  sectionIds.forEach((id, index) =>
    executor.input(`sId_${index}`, sql.BigInt, id)
  );

  try {
    // 1. Lấy tất cả lessons cơ bản
    const lessonsResult = await executor.query(`
          SELECT * FROM Lessons WHERE SectionID IN (${sectionIdPlaceholders}) ORDER BY SectionID, LessonOrder ASC;
      `);
    const lessons = lessonsResult.recordset;
    if (lessons.length === 0) return [];

    const lessonIds = lessons.map((l) => l.LessonID);

    // 2. Lấy đồng thời tất cả entities con
    const [questionsWithOptions, attachments, subtitles] = await Promise.all([
      // Lấy questions đã kèm options (showCorrectAnswer=true vì đây là backend)
      quizRepository.findAllQuestionsWithOptionsByLessonIds(
        lessonIds,
        true,
        transaction
      ),
      attachmentRepository.findAttachmentsByLessonIds(lessonIds, transaction),
      subtitleRepository.findSubtitlesByLessonIds(lessonIds, transaction),
    ]);

    // 3. Tạo map để gắn dữ liệu con vào lesson
    const questionsMap = new Map(); // Key: LessonID, Value: Array<QuestionWithOptions>
    questionsWithOptions.forEach((q) => {
      if (!questionsMap.has(q.LessonID)) {
        questionsMap.set(q.LessonID, []);
      }
      questionsMap.get(q.LessonID).push(q);
    });

    const attachmentsMap = new Map(); // Key: LessonID, Value: Array<Attachment>
    attachments.forEach((a) => {
      if (!attachmentsMap.has(a.LessonID)) {
        attachmentsMap.set(a.LessonID, []);
      }
      attachmentsMap.get(a.LessonID).push(a);
    });

    const subtitlesMap = new Map(); // Key: LessonID, Value: Array<Subtitle>
    subtitles.forEach((s) => {
      if (!subtitlesMap.has(s.LessonID)) {
        subtitlesMap.set(s.LessonID, []);
      }
      subtitlesMap.get(s.LessonID).push(s);
    });

    // 4. Gắn entities con vào đúng lesson
    const lessonsWithDetails = lessons.map((lesson) => ({
      ...lesson,
      questions: (questionsMap.get(lesson.LessonID) || []).sort(
        (a, b) => (a.QuestionOrder ?? 0) - (b.QuestionOrder ?? 0)
      ), // Sắp xếp lại q
      attachments: attachmentsMap.get(lesson.LessonID) || [],
      subtitles: (subtitlesMap.get(lesson.LessonID) || []).sort(
        (a, b) =>
          (a.IsDefault ? -1 : 1) - (b.IsDefault ? -1 : 1) ||
          a.LanguageName.localeCompare(b.LanguageName)
      ), // Sắp xếp lại sub
    }));
    return lessonsWithDetails;
  } catch (error) {
    logger.error(
      `Error fetching lessons with details for sections ${sectionIds.join(', ')}:`,
      error
    );
    throw error;
  }
};

module.exports = {
  getMaxLessonOrder,
  createLesson,
  findAllLessonsWithDetailsBySectionIds,
  deleteLessonsByIds,
  findLessonById,
  findLessonsBySectionId,
  updateLessonById,
  deleteLessonById,
  updateLessonsOrder,
};
