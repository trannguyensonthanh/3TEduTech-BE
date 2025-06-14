const httpStatus = require('http-status').status;
const ApiError = require('../../core/errors/ApiError');
const { getConnection, sql } = require('../../database/connection');
const {
  toPascalCaseObject,
  toCamelCaseObject,
} = require('../../utils/caseConverter');
const logger = require('../../utils/logger');

/**
 * Tạo câu hỏi mới cho một bài học quiz.
 * @param {object} questionData - { LessonID, QuestionText, Explanation, QuestionOrder }
 * @param {object} [transaction=null]
 * @returns {Promise<object>} - Question vừa tạo.
 */
const createQuestion = async (questionData, transaction = null) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('LessonID', sql.BigInt, questionData.LessonID);
  executor.input('QuestionText', sql.NVarChar, questionData.QuestionText);
  executor.input('Explanation', sql.NVarChar, questionData.Explanation);
  executor.input('QuestionOrder', sql.Int, questionData.QuestionOrder);
  try {
    const result = await executor.query(`
            INSERT INTO QuizQuestions (LessonID, QuestionText, Explanation, QuestionOrder)
            OUTPUT Inserted.*
            VALUES (@LessonID, @QuestionText, @Explanation, @QuestionOrder);
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error creating quiz question:', error);
    throw error;
  }
};

/**
 * Tạo nhiều lựa chọn cho một câu hỏi (trong transaction).
 * @param {number} questionId
 * @param {Array<object>} optionsData - Mảng các object { OptionText, IsCorrectAnswer, OptionOrder }
 * @param {object} transaction
 * @returns {Promise<void>}
 */
const createOptionsForQuestion = async (
  questionId,
  optionsData,
  transaction
) => {
  const optionsDataCamelCase = optionsData.map((opt) => toCamelCaseObject(opt));
  for (const option of optionsDataCamelCase) {
    logger.info(`Creating option for question ${questionId}:`, option);
    const request = transaction.request();
    request.input('QuestionID', sql.Int, questionId);
    request.input('OptionText', sql.NVarChar, option.optionText);
    request.input('IsCorrectAnswer', sql.Bit, option.isCorrectAnswer || false);
    request.input('OptionOrder', sql.Int, option.optionOrder);

    await request.query(`
      INSERT INTO QuizOptions (QuestionID, OptionText, IsCorrectAnswer, OptionOrder)
      VALUES (@QuestionID, @OptionText, @IsCorrectAnswer, @OptionOrder);
    `);
  }
};

/**
 * Tìm câu hỏi bằng ID (bao gồm các lựa chọn).
 * @param {number} questionId
 * @returns {Promise<object|null>} - Question object với mảng options.
 */
const findQuestionByIdWithOptions = async (questionId) => {
  try {
    const pool = await getConnection();
    const questionRequest = pool.request();
    questionRequest.input('QuestionID', sql.Int, questionId);
    const questionResult = await questionRequest.query(`
             SELECT q.*, l.SectionID, s.CourseID
             FROM QuizQuestions q
             JOIN Lessons l ON q.LessonID = l.LessonID
             JOIN Sections s ON l.SectionID = s.SectionID
             WHERE q.QuestionID = @QuestionID;
        `);
    const question = questionResult.recordset[0];

    if (!question) return null;

    const optionsRequest = pool.request();
    optionsRequest.input('QuestionID', sql.Int, questionId);
    const optionsResult = await optionsRequest.query(`
            SELECT * FROM QuizOptions WHERE QuestionID = @QuestionID ORDER BY OptionOrder ASC;
        `);
    question.options = optionsResult.recordset;

    return question;
  } catch (error) {
    logger.error(`Error finding question with options ${questionId}:`, error);
    throw error;
  }
};

/**
 * Lấy tất cả câu hỏi và lựa chọn của một bài học quiz.
 * @param {number} lessonId
 * @param {boolean} showCorrectAnswer - Có hiển thị đáp án đúng không (chỉ cho instructor/admin).
 * @returns {Promise<Array<object>>} - Mảng các câu hỏi, mỗi câu hỏi chứa mảng options.
 */
const findQuestionsWithOptionsByLessonId = async (
  lessonId,
  showCorrectAnswer = false
) => {
  try {
    const pool = await getConnection();
    const questionsRequest = pool.request();
    questionsRequest.input('LessonID', sql.BigInt, lessonId);
    const questionsResult = await questionsRequest.query(`
            SELECT * FROM QuizQuestions WHERE LessonID = @LessonID And IsArchived = 0 ORDER BY QuestionOrder ASC;
        `);
    const questions = questionsResult.recordset;

    if (questions.length === 0) return [];

    const questionIds = questions.map((q) => q.QuestionID);
    const idParams = questionIds.map((id, index) => `@id${index}`);
    const optionsRequest = pool.request();
    questionIds.forEach((id, index) =>
      optionsRequest.input(`id${index}`, sql.Int, id)
    );

    const optionsQuery = `
            SELECT * FROM QuizOptions
            WHERE QuestionID IN (${idParams.join(', ')})
            ORDER BY QuestionID, OptionOrder ASC;
        `;
    const optionsResult = await optionsRequest.query(optionsQuery);
    const allOptions = optionsResult.recordset;

    questions.forEach((q) => {
      q.options = allOptions
        .filter((opt) => opt.QuestionID === q.QuestionID)
        .map((opt) => {
          if (!showCorrectAnswer) {
            const publicOption = { ...opt };
            delete publicOption.IsCorrectAnswer;
            return publicOption;
          }
          return opt;
        });
    });

    return questions;
  } catch (error) {
    logger.error(`Error finding questions for lesson ${lessonId}:`, error);
    throw error;
  }
};

/**
 * Cập nhật câu hỏi.
 * @param {number} questionId
 * @param {object} updateData - { QuestionText, Explanation, QuestionOrder }
 * @returns {Promise<object>} - Question đã cập nhật.
 */
const updateQuestionById = async (questionId, updateData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    const updataToPascal = toPascalCaseObject(updateData);
    request.input('QuestionID', sql.Int, questionId);
    request.input('UpdatedAt', sql.DateTime2, new Date());

    const setClauses = ['UpdatedAt = @UpdatedAt'];
    if (updataToPascal.QuestionText !== undefined) {
      request.input('QuestionText', sql.NVarChar, updataToPascal.QuestionText);
      setClauses.push('QuestionText = @QuestionText');
    }
    if (updataToPascal.Explanation !== undefined) {
      request.input('Explanation', sql.NVarChar, updataToPascal.Explanation);
      setClauses.push('Explanation = @Explanation');
    }
    if (updataToPascal.QuestionOrder !== undefined) {
      request.input('QuestionOrder', sql.Int, updataToPascal.QuestionOrder);
      setClauses.push('QuestionOrder = @QuestionOrder');
    }

    if (setClauses.length === 1) return null;

    const result = await request.query(`
            UPDATE QuizQuestions SET ${setClauses.join(', ')}
            OUTPUT Inserted.*
            WHERE QuestionID = @QuestionID;
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error(`Error updating question ${questionId}:`, error);
    throw error;
  }
};

/**
 * Xóa các lựa chọn của một câu hỏi (trong transaction).
 * @param {number} questionId
 * @param {object} transaction
 * @returns {Promise<void>}
 */
const deleteOptionsByQuestionId = async (questionId, transaction) => {
  const request = transaction.request();
  request.input('QuestionID', sql.Int, questionId);
  await request.query(
    'DELETE FROM QuizOptions WHERE QuestionID = @QuestionID;'
  );
};

/**
 * Xóa tất cả câu hỏi (và các options liên quan do CASCADE) của một bài học.
 * @param {number} lessonId
 * @param {object} transaction
 * @returns {Promise<number>} - Số lượng câu hỏi đã xóa.
 */
const deleteQuestionsByLessonId = async (lessonId, transaction) => {
  if (!lessonId) return 0;
  const request = transaction.request();
  request.input('LessonID', sql.BigInt, lessonId);
  try {
    const result = await request.query(`
      DELETE FROM QuizQuestions WHERE LessonID = @LessonID;
    `);
    logger.info(
      `Deleted ${result.rowsAffected[0]} questions for lesson ${lessonId}.`
    );
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error deleting questions for lesson ${lessonId}:`, error);
    throw error;
  }
};

/**
 * [MỚI] Đánh dấu một mảng các câu hỏi là đã lưu trữ.
 * @param {number[]} questionIds
 * @param {object} transaction
 */
const archiveQuestionsByIds = async (questionIds, transaction) => {
  if (!questionIds || questionIds.length === 0) return 0;
  const request = transaction.request();
  const idPlaceholders = questionIds
    .map((_, index) => `@id_q_arc_${index}`)
    .join(',');
  questionIds.forEach((id, index) =>
    request.input(`id_q_arc_${index}`, sql.Int, id)
  );

  const result = await request.query(`
    UPDATE QuizQuestions SET IsArchived = 1, UpdatedAt = GETDATE()
    WHERE QuestionID IN (${idPlaceholders});
  `);
  return result.rowsAffected[0];
};

/**
 * [MỚI] Đánh dấu một mảng các lựa chọn là đã lưu trữ.
 * @param {number[]} optionIds
 * @param {object} transaction
 */
const archiveOptionsByIds = async (optionIds, transaction) => {
  if (!optionIds || optionIds.length === 0) return 0;
  const request = transaction.request();
  const idPlaceholders = optionIds
    .map((_, index) => `@id_o_arc_${index}`)
    .join(',');
  optionIds.forEach((id, index) =>
    request.input(`id_o_arc_${index}`, sql.BigInt, id)
  );

  const result = await request.query(`
    UPDATE QuizOptions SET IsArchived = 1
    WHERE OptionID IN (${idPlaceholders});
  `);
  return result.rowsAffected[0];
};

/**
 * [MỚI] Đánh dấu tất cả câu hỏi của một bài học là đã lưu trữ.
 * (Và các options liên quan cũng nên được đánh dấu)
 * @param {number} lessonId
 * @param {object} transaction
 * @returns {Promise<void>}
 */
const archiveQuestionsByLessonId = async (lessonId, transaction) => {
  if (!lessonId) return;
  const request = transaction.request();
  request.input('LessonID', sql.BigInt, lessonId);
  try {
    // Tìm các QuestionID cần archive
    const questionsResult = await request.query(`
        SELECT QuestionID FROM QuizQuestions WHERE LessonID = @LessonID AND IsArchived = 0;
    `);
    const questionIdsToArchive = questionsResult.recordset.map(
      (q) => q.QuestionID
    );

    if (questionIdsToArchive.length > 0) {
      const qIdPlaceholders = questionIdsToArchive
        .map((_, i) => `@qId_${i}`)
        .join(',');
      questionIdsToArchive.forEach((id, i) =>
        request.input(`qId_${i}`, sql.Int, id)
      );

      // Archive các options trước
      await request.query(`
            UPDATE QuizOptions SET IsArchived = 1 
            WHERE QuestionID IN (${qIdPlaceholders});
        `);

      // Sau đó archive các questions
      const result = await request.query(`
            UPDATE QuizQuestions SET IsArchived = 1, UpdatedAt = GETDATE()
            WHERE QuestionID IN (${qIdPlaceholders});
        `);
      logger.info(
        `(Sync) Archived ${result.rowsAffected[0]} questions and their options for lesson ${lessonId}.`
      );
    }
  } catch (error) {
    logger.error(
      `(Sync) Error archiving questions for lesson ${lessonId}:`,
      error
    );
    throw error;
  }
};

/**
 * Xóa câu hỏi bằng ID.
 * @param {number} questionId
 * @returns {Promise<number>} - Số dòng bị ảnh hưởng.
 */
const deleteQuestionById = async (questionId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('QuestionID', sql.Int, questionId);
    const result = await request.query(
      'DELETE FROM QuizQuestions WHERE QuestionID = @QuestionID'
    );
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error deleting question ${questionId}:`, error);
    if (error.number === 547) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Không thể xóa câu hỏi vì có lựa chọn liên quan.'
      );
    }
    throw error;
  }
};

/**
 * Lấy số lần thử quiz lớn nhất của user cho lesson.
 * @param {number} accountId
 * @param {number} lessonId
 * @returns {Promise<number>} - Lần thử lớn nhất, hoặc 0 nếu chưa thử.
 */
const getMaxAttemptNumber = async (accountId, lessonId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, accountId);
    request.input('LessonID', sql.BigInt, lessonId);
    const result = await request.query(`
            SELECT MAX(AttemptNumber) as maxAttempt
            FROM QuizAttempts
            WHERE AccountID = @AccountID AND LessonID = @LessonID;
        `);
    return result.recordset[0].maxAttempt || 0;
  } catch (error) {
    logger.error(
      `Error getting max attempt number for user ${accountId}, lesson ${lessonId}:`,
      error
    );
    throw error;
  }
};

/**
 * Bắt đầu một lượt làm quiz mới.
 * @param {object} attemptData - { LessonID, AccountID, AttemptNumber }
 * @returns {Promise<object>} - QuizAttempt vừa tạo.
 */
const createQuizAttempt = async (attemptData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('LessonID', sql.BigInt, attemptData.LessonID);
    request.input('AccountID', sql.BigInt, attemptData.AccountID);
    request.input('AttemptNumber', sql.Int, attemptData.AttemptNumber);

    const result = await request.query(`
            INSERT INTO QuizAttempts (LessonID, AccountID, AttemptNumber)
            OUTPUT Inserted.*
            VALUES (@LessonID, @AccountID, @AttemptNumber);
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error creating quiz attempt:', error);
    if (error.number === 2627 || error.number === 2601) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Lỗi khi tạo lượt làm bài (trùng lặp).'
      );
    }
    throw error;
  }
};

/**
 * Lưu câu trả lời của học viên cho một lượt làm quiz (trong transaction).
 * @param {Array<object>} answersData - Mảng các object { AttemptID, QuestionID, SelectedOptionID }
 * @param {object} transaction
 * @returns {Promise<void>}
 */
const saveAttemptAnswers = async (answersData, transaction) => {
  for (const answer of answersData) {
    const request = transaction.request();
    request.input('AttemptID', sql.BigInt, answer.AttemptID);
    request.input('QuestionID', sql.Int, answer.QuestionID);
    request.input('SelectedOptionID', sql.BigInt, answer.SelectedOptionID);

    await request.query(`
      INSERT INTO QuizAttemptAnswers (AttemptID, QuestionID, SelectedOptionID)
      VALUES (@AttemptID, @QuestionID, @SelectedOptionID);
    `);
  }
};

/**
 * Lấy tất cả các lựa chọn đúng của các câu hỏi trong một bài quiz.
 * Dùng để chấm điểm.
 * @param {number} lessonId
 * @returns {Promise<Map<number, number>>} - Map với key là QuestionID, value là OptionID đúng.
 */
const getCorrectOptionsForLesson = async (lessonId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('LessonID', sql.BigInt, lessonId);
    const result = await request.query(`
            SELECT opt.QuestionID, opt.OptionID
            FROM QuizOptions opt
            JOIN QuizQuestions q ON opt.QuestionID = q.QuestionID
            WHERE q.LessonID = @LessonID AND opt.IsCorrectAnswer = 1;
        `);
    const correctOptionsMap = new Map();
    result.recordset.forEach((row) => {
      correctOptionsMap.set(row.QuestionID, row.OptionID);
    });
    return correctOptionsMap;
  } catch (error) {
    logger.error(
      `Error getting correct options for lesson ${lessonId}:`,
      error
    );
    throw error;
  }
};

/**
 * Cập nhật kết quả (IsCorrect) cho các câu trả lời của một lượt làm (trong transaction).
 * @param {Array<{answerId: number, isCorrect: boolean}>} resultsData
 * @param {object} transaction
 * @returns {Promise<void>}
 */
const updateAttemptAnswersResult = async (resultsData, transaction) => {
  for (const result of resultsData) {
    const request = transaction.request();
    request.input(
      `AttemptAnswerID_${result.answerId}`,
      sql.BigInt,
      result.answerId
    );
    request.input(`IsCorrect_${result.answerId}`, sql.Bit, result.isCorrect);

    await request.query(`
      UPDATE QuizAttemptAnswers
      SET IsCorrect = @IsCorrect_${result.answerId}
      WHERE AttemptAnswerID = @AttemptAnswerID_${result.answerId};
    `);
  }
};

/**
 * Cập nhật điểm số và trạng thái hoàn thành cho một lượt làm quiz.
 * @param {number} attemptId
 * @param {object} resultData - { score, isPassed }
 * @returns {Promise<object>} - QuizAttempt đã cập nhật.
 */
const finalizeQuizAttempt = async (attemptId, resultData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AttemptID', sql.BigInt, attemptId);
    request.input('CompletedAt', sql.DateTime2, new Date());
    request.input('Score', sql.Decimal(5, 2), resultData.score);
    request.input('IsPassed', sql.Bit, resultData.isPassed);

    const result = await request.query(`
            UPDATE QuizAttempts
            SET CompletedAt = @CompletedAt, Score = @Score, IsPassed = @IsPassed
            OUTPUT Inserted.*
            WHERE AttemptID = @AttemptID;
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error(`Error finalizing quiz attempt ${attemptId}:`, error);
    throw error;
  }
};

/**
 * Lấy chi tiết một lượt làm quiz, bao gồm câu hỏi, lựa chọn đã chọn, đáp án đúng và các options.
 * @param {number} attemptId - ID của lượt làm quiz.
 * @returns {Promise<object|null>} - Chi tiết lượt làm.
 */
const findQuizAttemptDetails = async (attemptId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AttemptID', sql.BigInt, attemptId);

    const result = await request.query(`
        SELECT
            qa.AttemptID, qa.LessonID, qa.AccountID, qa.StartedAt, qa.CompletedAt, qa.Score, qa.IsPassed, qa.AttemptNumber,
            l.LessonName,
            (
                SELECT
                    qaa.AttemptAnswerID,
                    qaa.QuestionID,
                    q.QuestionText,
                    q.Explanation,
                    q.QuestionOrder,
                    qaa.SelectedOptionID,
                    so.OptionText as SelectedOptionText,
                    qaa.IsCorrect,
                    co.OptionID as CorrectOptionID,
                    co.OptionText as CorrectOptionText,
                    (
                        SELECT opt.OptionID, opt.OptionText, opt.IsCorrectAnswer, opt.OptionOrder
                        FROM QuizOptions opt
                        WHERE opt.QuestionID = q.QuestionID
                        ORDER BY opt.OptionOrder ASC
                        FOR JSON PATH
                    ) AS OptionsJSON
                FROM QuizAttemptAnswers qaa
                JOIN QuizQuestions q ON qaa.QuestionID = q.QuestionID
                LEFT JOIN QuizOptions so ON qaa.SelectedOptionID = so.OptionID
                LEFT JOIN QuizOptions co ON q.QuestionID = co.QuestionID AND co.IsCorrectAnswer = 1
                WHERE qaa.AttemptID = qa.AttemptID
                ORDER BY q.QuestionOrder ASC
                FOR JSON PATH
            ) AS DetailsJSON
        FROM QuizAttempts qa
        JOIN Lessons l ON qa.LessonID = l.LessonID
        WHERE qa.AttemptID = @AttemptID;
    `);

    const attemptDetails = {
      ...result.recordset[0],
    };
    delete attemptDetails.DetailsJSON;
    let detailsResult;

    if (!attemptDetails) return null;

    if (result.recordset[0].DetailsJSON) {
      const details =
        typeof result.recordset[0].DetailsJSON === 'string'
          ? JSON.parse(result.recordset[0].DetailsJSON)
          : result.recordset[0].DetailsJSON;

      details.forEach((detail) => {
        const opts = detail.OptionsJSON;
        detail.Options =
          typeof opts === 'string' ? JSON.parse(opts) : opts || [];
        delete detail.OptionsJSON;
      });

      detailsResult = details;
      delete detailsResult.DetailsJSON;
    } else {
      detailsResult = [];
    }

    return {
      attempt: attemptDetails,
      details: detailsResult,
    };
  } catch (error) {
    logger.error(`Error finding quiz attempt details ${attemptId}:`, error);
    throw error;
  }
};

/**
 * Lấy lịch sử các lượt làm quiz của user cho một lesson.
 * @param {number} accountId
 * @param {number} lessonId
 * @returns {Promise<Array<object>>}
 */
const findAttemptsByLessonAndUser = async (accountId, lessonId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, accountId);
    request.input('LessonID', sql.BigInt, lessonId);
    const result = await request.query(`
            SELECT AttemptID, StartedAt, CompletedAt, Score, IsPassed, AttemptNumber
            FROM QuizAttempts
            WHERE AccountID = @AccountID AND LessonID = @LessonID
            ORDER BY AttemptNumber DESC;
        `);
    return result.recordset;
  } catch (error) {
    logger.error(
      `Error finding attempts for user ${accountId}, lesson ${lessonId}:`,
      error
    );
    throw error;
  }
};

/**
 * Lấy thứ tự câu hỏi lớn nhất của một bài học quiz.
 * @param {number} lessonId
 * @param {object} [transaction=null]
 * @returns {Promise<number>} - Thứ tự lớn nhất, hoặc -1 nếu chưa có.
 */
const getMaxQuestionOrder = async (lessonId, transaction = null) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('LessonID', sql.BigInt, lessonId);
  try {
    const result = await executor.query(
      'SELECT MAX(QuestionOrder) as maxOrder FROM QuizQuestions WHERE LessonID = @LessonID'
    );
    return result.recordset[0].maxOrder === null
      ? -1
      : result.recordset[0].maxOrder;
  } catch (error) {
    logger.error(
      `Error getting max question order for lesson ${lessonId}:`,
      error
    );
    throw error;
  }
};

/**
 * Lấy tất cả options cho một danh sách Question IDs.
 * @param {Array<number>} questionIds
 * @param {object} [transaction=null]
 * @returns {Promise<Array<QuizOption>>}
 */
const findAllOptionsByQuestionIds = async (questionIds, transaction = null) => {
  if (!questionIds || questionIds.length === 0) return [];
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  const qIdPlaceholders = questionIds
    .map((_, index) => `@qId_opt_${index}`)
    .join(',');
  questionIds.forEach((id, index) =>
    executor.input(`qId_opt_${index}`, sql.Int, id)
  );

  try {
    const result = await executor.query(`
          SELECT * FROM QuizOptions
          WHERE QuestionID IN (${qIdPlaceholders}) AND IsArchived = 0
          ORDER BY QuestionID, OptionOrder ASC;
      `);
    return result.recordset;
  } catch (error) {
    logger.error(
      `Error fetching options for questions ${questionIds.join(', ')}:`,
      error
    );
    throw error;
  }
};

/**
 * Lấy tất cả câu hỏi và lựa chọn cho một danh sách Lesson IDs.
 * @param {Array<number>} lessonIds
 * @param {boolean} showCorrectAnswer
 * @param {object} [transaction=null]
 * @returns {Promise<Array<QuizQuestion>>} Mảng questions với options lồng nhau.
 */
const findAllQuestionsWithOptionsByLessonIds = async (
  lessonIds,
  showCorrectAnswer = false,
  transaction = null
) => {
  if (!lessonIds || lessonIds.length === 0) return [];
  logger.debug(
    `Fetching questions/options for lessons: ${lessonIds.join(', ')}`
  );

  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();

  const lessonIdPlaceholders = lessonIds
    .map((_, index) => `@lId_qw_${index}`)
    .join(',');
  lessonIds.forEach((id, index) =>
    executor.input(`lId_qw_${index}`, sql.BigInt, id)
  );

  try {
    const questionsResult = await executor.query(`
          SELECT * FROM QuizQuestions
          WHERE LessonID IN (${lessonIdPlaceholders}) AND IsArchived = 0
          ORDER BY LessonID, QuestionOrder ASC;
      `);
    const questions = questionsResult.recordset;
    if (questions.length === 0) return [];

    const questionIds = questions.map((q) => q.QuestionID);
    const options = await findAllOptionsByQuestionIds(questionIds, transaction);

    const optionsMap = new Map();
    options.forEach((opt) => {
      if (!optionsMap.has(opt.QuestionID)) {
        optionsMap.set(opt.QuestionID, []);
      }

      const optionData = showCorrectAnswer
        ? opt
        : { ...opt, IsCorrectAnswer: undefined };

      optionsMap.get(opt.QuestionID).push(optionData);
    });

    questions.forEach((q) => {
      q.options = (optionsMap.get(q.QuestionID) || []).sort(
        (a, b) => (a.OptionOrder ?? 0) - (b.OptionOrder ?? 0)
      );
    });

    return questions;
  } catch (error) {
    logger.error(
      `Error fetching questions for lessons ${lessonIds.join(', ')}:`,
      error
    );
    throw error;
  }
};

/**
 * Xóa nhiều câu hỏi bằng IDs (CASCADE nên xóa cả options).
 * @param {Array<number>} questionIds
 * @param {object} transaction
 * @returns {Promise<number>}
 */
const deleteQuestionsByIds = async (questionIds, transaction) => {
  if (!questionIds || questionIds.length === 0) return 0;
  const request = transaction.request();
  const idPlaceholders = questionIds
    .map((_, index) => `@id_q_del_${index}`)
    .join(',');
  questionIds.forEach((id, index) =>
    request.input(`id_q_del_${index}`, sql.Int, id)
  );
  try {
    const result = await request.query(
      `DELETE FROM QuizQuestions WHERE QuestionID IN (${idPlaceholders});`
    );
    logger.info(`Deleted ${result.rowsAffected[0]} questions.`);
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(
      `Error bulk deleting questions: ${questionIds.join(', ')}`,
      error
    );
    if (error.number === 547)
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to delete related question data.'
      );
    throw error;
  }
};

/**
 * Xóa nhiều option bằng IDs.
 * @param {Array<number>} optionIds
 * @param {object} transaction
 * @returns {Promise<number>}
 */
const deleteOptionsByIds = async (optionIds, transaction) => {
  if (!optionIds || optionIds.length === 0) return 0;
  const request = transaction.request();
  const idPlaceholders = optionIds
    .map((_, index) => `@id_opt_del_${index}`)
    .join(',');
  optionIds.forEach((id, index) =>
    request.input(`id_opt_del_${index}`, sql.BigInt, id)
  );
  try {
    const result = await request.query(
      `DELETE FROM QuizOptions WHERE OptionID IN (${idPlaceholders});`
    );
    logger.info(`Deleted ${result.rowsAffected[0]} options.`);
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error bulk deleting options: ${optionIds.join(', ')}`, error);
    throw error;
  }
};

/**
 * Cập nhật nhiều option cùng lúc.
 * @param {Array<{id: number, data: object}>} optionsToUpdate
 * @param {object} transaction
 * @returns {Promise<void>}
 */
const updateOptionsBatch = async (optionsToUpdate, transaction) => {
  if (!optionsToUpdate || optionsToUpdate.length === 0) return;
  logger.debug(`Batch updating ${optionsToUpdate.length} options...`);
  for (const optUpdate of optionsToUpdate) {
    const request = transaction.request();
    request.input('OptionID', sql.BigInt, optUpdate.id);
    const setClauses = [];
    if (optUpdate.data.OptionText !== undefined) {
      request.input('OptionText', sql.NVarChar, optUpdate.data.OptionText);
      setClauses.push('OptionText = @OptionText');
    }
    if (optUpdate.data.IsCorrectAnswer !== undefined) {
      request.input('IsCorrectAnswer', sql.Bit, optUpdate.data.IsCorrectAnswer);
      setClauses.push('IsCorrectAnswer = @IsCorrectAnswer');
    }
    if (optUpdate.data.OptionOrder !== undefined) {
      request.input('OptionOrder', sql.Int, optUpdate.data.OptionOrder);
      setClauses.push('OptionOrder = @OptionOrder');
    }
    if (setClauses.length > 0) {
      await request.query(
        `UPDATE QuizOptions SET ${setClauses.join(', ')} WHERE OptionID = @OptionID;`
      );
    }
  }
};

/**
 * Thêm mới nhiều option cùng lúc.
 * @param {Array<object>} optionsToCreate - Dữ liệu option mới (bao gồm QuestionID).
 * @param {object} transaction
 * @returns {Promise<void>}
 */
const insertOptionsBatch = async (optionsToCreate, transaction) => {
  if (!optionsToCreate || optionsToCreate.length === 0) return;
  logger.debug(`Batch inserting ${optionsToCreate.length} options...`);
  for (const optCreate of optionsToCreate) {
    const request = transaction.request();
    request.input('QuestionID', sql.Int, optCreate.QuestionID);
    request.input('OptionText', sql.NVarChar, optCreate.OptionText);
    request.input(
      'IsCorrectAnswer',
      sql.Bit,
      optCreate.IsCorrectAnswer || false
    );
    request.input('OptionOrder', sql.Int, optCreate.OptionOrder);
    await request.query(
      `INSERT INTO QuizOptions (QuestionID, OptionText, IsCorrectAnswer, OptionOrder) VALUES (@QuestionID, @OptionText, @IsCorrectAnswer, @OptionOrder);`
    );
  }
};

module.exports = {
  createQuestion,
  createOptionsForQuestion,
  findQuestionByIdWithOptions,
  findQuestionsWithOptionsByLessonId,
  updateQuestionById,
  deleteOptionsByQuestionId,
  deleteQuestionsByLessonId,
  archiveQuestionsByIds,
  archiveOptionsByIds,
  archiveQuestionsByLessonId,
  deleteQuestionById,
  getMaxAttemptNumber,
  createQuizAttempt,
  saveAttemptAnswers,
  getCorrectOptionsForLesson,
  updateAttemptAnswersResult,
  finalizeQuizAttempt,
  findQuizAttemptDetails,
  findAttemptsByLessonAndUser,
  getMaxQuestionOrder,
  findAllQuestionsWithOptionsByLessonIds,
  findAllOptionsByQuestionIds,
  deleteQuestionsByIds,
  deleteOptionsByIds,
  updateOptionsBatch,
  insertOptionsBatch,
};
