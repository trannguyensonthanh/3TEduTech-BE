const httpStatus = require('http-status').status;
const quizRepository = require('./quizzes.repository');
const lessonRepository = require('../lessons/lessons.repository'); // Để kiểm tra lesson
const { checkCourseAccess } = require('../sections/sections.service'); // Dùng lại hàm check quyền course
const enrollmentService = require('../enrollments/enrollments.service'); // Check enrollment
const ApiError = require('../../core/errors/ApiError');
const LessonType = require('../../core/enums/LessonType');
const logger = require('../../utils/logger');
const { getConnection, sql } = require('../../database/connection');
const progressService = require('../progress/progress.service');
const { toCamelCaseObject } = require('../../utils/caseConverter');
// === Question & Option Management (Instructor) ===

/**
 * Tạo câu hỏi mới kèm theo các lựa chọn.
 * @param {number} lessonId
 * @param {object} questionData - { questionText, explanation, questionOrder, options: [{optionText, isCorrectAnswer, optionOrder}] }
 * @param {object} user - Người dùng tạo.
 * @returns {Promise<object>} - Câu hỏi mới kèm options.
 */
const createQuestionWithOptions = async (lessonId, questionData, user) => {
  const lesson = await lessonRepository.findLessonById(lessonId);
  if (!lesson)
    throw new ApiError(httpStatus.NOT_FOUND, 'Bài học không tồn tại.');
  if (lesson.LessonType !== LessonType.QUIZ)
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Bài học này không phải loại QUIZ.'
    );
  await checkCourseAccess(lesson.CourseID, user, 'tạo câu hỏi quiz');

  // Validate options: phải có ít nhất 1 đáp án đúng? Tùy logic. Phải có ít nhất 2 lựa chọn?
  if (!questionData.options || questionData.options.length < 2) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Câu hỏi phải có ít nhất 2 lựa chọn.'
    );
  }
  const correctAnswersCount = questionData.options.filter(
    (opt) => opt.isCorrectAnswer
  ).length;
  if (correctAnswersCount !== 1) {
    // Giả sử chỉ cho phép 1 đáp án đúng
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Mỗi câu hỏi phải có đúng 1 đáp án đúng.'
    );
  }
  // Validate optionOrder duy nhất và liên tục từ 0
  const orders = questionData.options
    .map((o) => o.optionOrder)
    .sort((a, b) => a - b);
  if (
    new Set(orders).size !== orders.length ||
    orders[0] !== 0 ||
    !orders.every((o, i) => o === i)
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Thứ tự lựa chọn không hợp lệ.');
  }

  // TODO: Xác định questionOrder (ví dụ: lấy max order + 1)

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const maxOrder = await quizRepository.getMaxQuestionOrder(
      lessonId,
      transaction
    );
    const newOrder = maxOrder + 1;
    // Tạo câu hỏi
    const newQuestion = await quizRepository.createQuestion(
      {
        LessonID: lessonId,
        QuestionText: questionData.questionText,
        Explanation: questionData.explanation,
        QuestionOrder: newOrder, // Cần tính toán order này
      },
      transaction
    );

    // Tạo các lựa chọn
    await quizRepository.createOptionsForQuestion(
      newQuestion.QuestionID,
      questionData.options,
      transaction
    );

    await transaction.commit();

    // Lấy lại câu hỏi với options để trả về
    const createdQuestionWithOptions =
      await quizRepository.findQuestionByIdWithOptions(newQuestion.QuestionID);
    return toCamelCaseObject(createdQuestionWithOptions);
  } catch (error) {
    logger.error(
      `Error creating question with options for lesson ${lessonId}:`,
      error
    );
    await transaction.rollback();
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Tạo câu hỏi thất bại.'
    );
  }
};

/**
 * Lấy danh sách câu hỏi kèm lựa chọn của một bài học quiz (cho instructor xem).
 * @param {number} lessonId
 * @param {object} user
 * @returns {Promise<Array<object>>}
 */
const getQuestionsForInstructor = async (lessonId, user) => {
  const lesson = await lessonRepository.findLessonById(lessonId);
  if (!lesson)
    throw new ApiError(httpStatus.NOT_FOUND, 'Bài học không tồn tại.');
  if (lesson.LessonType !== LessonType.QUIZ)
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Bài học này không phải loại QUIZ.'
    );
  await checkCourseAccess(lesson.CourseID, user, 'xem câu hỏi quiz');

  return quizRepository.findQuestionsWithOptionsByLessonId(lessonId, true); // true = show correct answer
};

/**
 * Cập nhật câu hỏi và các lựa chọn của nó.
 * @param {number} questionId
 * @param {object} updateData - { questionText, explanation, questionOrder, options: [...] }
 * @param {object} user
 * @returns {Promise<object>} - Câu hỏi đã cập nhật.
 */
const updateQuestionWithOptions = async (questionId, updateData, user) => {
  const question = await quizRepository.findQuestionByIdWithOptions(questionId);
  if (!question)
    throw new ApiError(httpStatus.NOT_FOUND, 'Câu hỏi không tồn tại.');
  await checkCourseAccess(question.CourseID, user, 'cập nhật câu hỏi quiz');

  const { options: newOptionsData, ...questionUpdateData } = updateData;

  // Validate options mới nếu có
  if (newOptionsData) {
    if (!newOptionsData || newOptionsData.length < 2)
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Câu hỏi phải có ít nhất 2 lựa chọn.'
      );
    const correctAnswersCount = newOptionsData.filter(
      (opt) => opt.isCorrectAnswer
    ).length;
    if (correctAnswersCount !== 1)
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Mỗi câu hỏi phải có đúng 1 đáp án đúng.'
      );
    const orders = newOptionsData
      .map((o) => o.optionOrder)
      .sort((a, b) => a - b);
    if (
      new Set(orders).size !== orders.length ||
      orders[0] !== 0 ||
      !orders.every((o, i) => o === i)
    )
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Thứ tự lựa chọn không hợp lệ.'
      );
  }

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // Cập nhật thông tin câu hỏi (nếu có)
    if (Object.keys(questionUpdateData).length > 0) {
      await quizRepository.updateQuestionById(
        questionId,
        questionUpdateData,
        transaction
      );
    }

    // Nếu có options mới -> Xóa options cũ và thêm options mới
    if (newOptionsData) {
      await quizRepository.deleteOptionsByQuestionId(questionId, transaction);
      await quizRepository.createOptionsForQuestion(
        questionId,
        newOptionsData,
        transaction
      );
    }

    await transaction.commit();

    const updatedQuestionWithOptions =
      await quizRepository.findQuestionByIdWithOptions(questionId);
    return toCamelCaseObject(updatedQuestionWithOptions);
  } catch (error) {
    logger.error(`Error updating question ${questionId} with options:`, error);
    await transaction.rollback();
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Cập nhật câu hỏi thất bại.'
    );
  }
};

/**
 * Xóa câu hỏi quiz.
 * @param {number} questionId
 * @param {object} user
 * @returns {Promise<void>}
 */
const deleteQuestion = async (questionId, user) => {
  const question = await quizRepository.findQuestionByIdWithOptions(questionId); // Lấy để check quyền
  if (!question)
    throw new ApiError(httpStatus.NOT_FOUND, 'Câu hỏi không tồn tại.');
  await checkCourseAccess(question.CourseID, user, 'xóa câu hỏi quiz');

  await quizRepository.deleteQuestionById(questionId); // Giả sử FK cascade xóa options
  logger.info(`Quiz question ${questionId} deleted by user ${user.id}`);
};

// === Quiz Attempt & Answer (Student) ===

/**
 * Bắt đầu một lượt làm quiz.
 * @param {number} lessonId
 * @param {object} user
 * @returns {Promise<object>} - Thông tin lượt làm và danh sách câu hỏi (không có đáp án).
 */
const startQuizAttempt = async (lessonId, user) => {
  const lesson = await lessonRepository.findLessonById(lessonId);
  if (!lesson)
    throw new ApiError(httpStatus.NOT_FOUND, 'Bài học không tồn tại.');
  if (lesson.LessonType !== LessonType.QUIZ)
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Bài học này không phải loại QUIZ.'
    );
  const isEnrolled = await enrollmentService.isUserEnrolled(
    user.id,
    lesson.CourseID
  );
  if (!isEnrolled)
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn cần đăng ký khóa học để làm bài quiz.'
    );

  // TODO: Kiểm tra số lần làm tối đa nếu có quy định

  const maxAttempt = await quizRepository.getMaxAttemptNumber(
    user.id,
    lessonId
  );
  const nextAttemptNumber = maxAttempt + 1;

  // Tạo bản ghi attempt mới
  const newAttempt = await quizRepository.createQuizAttempt({
    LessonID: lessonId,
    AccountID: user.id,
    AttemptNumber: nextAttemptNumber,
  });

  // Lấy danh sách câu hỏi (không kèm đáp án)
  const questions = await quizRepository.findQuestionsWithOptionsByLessonId(
    lessonId,
    false
  ); // false = hide correct answer

  return {
    attempt: toCamelCaseObject(newAttempt),
    questions: toCamelCaseObject(questions),
  };
};

/**
 * Nộp bài làm quiz và chấm điểm.
 * @param {number} attemptId - ID của lượt làm đang thực hiện.
 * @param {Array<{questionId: number, selectedOptionId: number|null}>} answers - Mảng câu trả lời của user.
 * @param {object} user
 * @returns {Promise<object>} - Kết quả chi tiết của lượt làm.
 */
const submitQuizAttempt = async (attemptId, answers, user) => {
  // 1. Lấy thông tin attempt để kiểm tra
  const attempt = await quizRepository.findQuizAttemptDetails(attemptId); // Hàm này cần sửa để lấy attempt cơ bản trước
  // --- TẠM THỜI: Giả sử có hàm findAttemptById(attemptId) ---
  // const attempt = await quizRepository.findAttemptById(attemptId);
  console.log('Attempt:', attempt);
  if (!attempt)
    throw new ApiError(httpStatus.NOT_FOUND, 'Lượt làm bài không tồn tại.');
  if (attempt.attempt.AccountID !== user.id)
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn không phải người làm bài này.'
    );
  // if (attempt.CompletedAt)
  //   throw new ApiError(httpStatus.BAD_REQUEST, 'Bài làm này đã được nộp.');

  // 2. Lấy danh sách câu hỏi và đáp án đúng của bài quiz
  const lessonId = attempt.attempt.LessonID;
  const questionsInQuiz =
    await quizRepository.findQuestionsWithOptionsByLessonId(lessonId, true); // Lấy cả đáp án đúng
  const correctOptionsMap =
    await quizRepository.getCorrectOptionsForLesson(lessonId); // Map<QuestionID, CorrectOptionID>

  // 3. Validate answers: Đảm bảo đủ câu trả lời cho tất cả câu hỏi
  const providedQuestionIds = new Set(answers.map((a) => a.questionId));
  const quizQuestionIds = new Set(questionsInQuiz.map((q) => q.QuestionID));
  if (
    providedQuestionIds.size !== quizQuestionIds.size ||
    ![...quizQuestionIds].every((id) => providedQuestionIds.has(id))
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Cần trả lời tất cả các câu hỏi trong bài quiz.'
    );
  }
  // Validate selectedOptionId có thuộc về questionId tương ứng không (tùy chọn)

  // 4. Chấm điểm và chuẩn bị dữ liệu lưu answer details
  let score = 0;
  // const answerResultsToUpdate = []; // Mảng để cập nhật IsCorrect
  const answersToSave = answers.map((userAnswer) => {
    const isCorrect =
      Number(correctOptionsMap.get(userAnswer.questionId)) ===
      userAnswer.selectedOptionId;
    if (isCorrect) {
      score += 1;
    }
    return {
      AttemptID: attemptId,
      QuestionID: userAnswer.questionId,
      SelectedOptionID: userAnswer.selectedOptionId,
      // IsCorrect sẽ được cập nhật sau khi lưu
    };
  });

  // 5. Lưu câu trả lời và cập nhật kết quả vào DB (trong transaction)
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // Lưu các bản ghi QuizAttemptAnswers (chưa có IsCorrect)
    await quizRepository.saveAttemptAnswers(answersToSave, transaction);

    // Lấy lại các bản ghi vừa lưu để lấy ID và cập nhật IsCorrect
    // Cách đơn giản: Query lại dựa trên AttemptID và QuestionID (có thể chậm nếu nhiều câu)
    // Cách tốt hơn: OUTPUT Inserted.AttemptAnswerID,... khi saveAttemptAnswers hoặc dùng logic khác
    const savedAnswers = await transaction
      .request()
      .input('AttemptID', sql.BigInt, attemptId)
      .query(
        'SELECT AttemptAnswerID, QuestionID, SelectedOptionID FROM QuizAttemptAnswers WHERE AttemptID = @AttemptID'
      );

    const resultsToUpdate = savedAnswers.recordset.map((savedAns) => ({
      answerId: savedAns.AttemptAnswerID,
      isCorrect:
        correctOptionsMap.get(savedAns.QuestionID) ===
        savedAns.SelectedOptionID,
    }));
    await quizRepository.updateAttemptAnswersResult(
      resultsToUpdate,
      transaction
    );

    await transaction.commit();
  } catch (error) {
    logger.error(`Error saving/grading quiz attempt ${attemptId}:`, error);
    await transaction.rollback();
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Lưu bài làm thất bại.'
    );
  }
  console.log('Saved answers:', questionsInQuiz);
  console.log('score:', score);
  console.log('answersToSave:', answersToSave);
  console.log('answers', answers);
  console.log('correctOptionsMap:', correctOptionsMap);
  // 6. Tính điểm cuối cùng (% hoặc điểm tuyệt đối) và trạng thái Pass/Fail
  const totalQuestions = questionsInQuiz.length;
  const finalScore = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;
  const isPassed = finalScore >= 50; // Ngưỡng pass, có thể cấu hình

  // 7. Cập nhật bản ghi QuizAttempts
  await quizRepository.finalizeQuizAttempt(attemptId, {
    score: finalScore,
    isPassed,
  });

  // 8. Lấy chi tiết kết quả để trả về
  const attemptDetails = await quizRepository.findQuizAttemptDetails(attemptId);

  // 9. Cập nhật LessonProgress nếu đạt (tùy chọn)
  if (isPassed) {
    try {
      await progressService.markLessonCompletion(user.id, lessonId, true);
    } catch (progressError) {
      logger.error(
        `Failed to mark lesson ${lessonId} complete after passing quiz attempt ${attemptId}:`,
        progressError
      );
    }
  }

  return toCamelCaseObject(attemptDetails);
};

/**
 * Lấy kết quả chi tiết của một lượt làm quiz đã hoàn thành.
 * @param {number} attemptId
 * @param {object} user
 * @returns {Promise<object>}
 */
const getQuizAttemptResult = async (attemptId, user) => {
  const attemptDetails = await quizRepository.findQuizAttemptDetails(attemptId);
  if (!attemptDetails)
    throw new ApiError(httpStatus.NOT_FOUND, 'Lượt làm bài không tồn tại.');
  if (attemptDetails.attempt.AccountID !== user.id)
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn không có quyền xem kết quả này.'
    );
  if (!attemptDetails.attempt.CompletedAt)
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Lượt làm bài này chưa được hoàn thành.'
    );

  return toCamelCaseObject(attemptDetails);
};

/**
 * Lấy lịch sử các lượt làm quiz của user cho một lesson.
 * @param {number} lessonId
 * @param {object} user
 * @returns {Promise<Array<object>>}
 */
const getQuizAttemptHistory = async (lessonId, user) => {
  const lesson = await lessonRepository.findLessonById(lessonId);
  if (!lesson)
    throw new ApiError(httpStatus.NOT_FOUND, 'Bài học không tồn tại.');
  // Không cần check enrollment vì nếu đã có attempt thì chắc chắn đã enroll
  if (lesson.LessonType !== LessonType.QUIZ)
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Bài học này không phải loại QUIZ.'
    );
  const result = quizRepository.findAttemptsByLessonAndUser(user.id, lessonId);
  return toCamelCaseObject(result);
};
module.exports = {
  // Instructor
  createQuestionWithOptions,
  getQuestionsForInstructor,
  updateQuestionWithOptions,
  deleteQuestion,
  // Student
  startQuizAttempt,
  submitQuizAttempt,
  getQuizAttemptResult,
  getQuizAttemptHistory,
};
