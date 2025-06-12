// File: src/api/enrollments/enrollments.repository.js

const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');

/**
 * Tạo bản ghi đăng ký mới.
 * @param {object} enrollmentData - { AccountID, CourseID, PurchasePrice }
 * @param {object} [transaction=null] - Transaction nếu có.
 * @returns {Promise<object>} - Bản ghi enrollment vừa tạo.
 */
const createEnrollment = async (enrollmentData, transaction = null) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('AccountID', sql.BigInt, enrollmentData.AccountID);
  executor.input('CourseID', sql.BigInt, enrollmentData.CourseID);
  executor.input(
    'PurchasePrice',
    sql.Decimal(18, 4),
    enrollmentData.PurchasePrice
  );

  try {
    const result = await executor.query(`
            INSERT INTO Enrollments (AccountID, CourseID, PurchasePrice)
            OUTPUT Inserted.*
            VALUES (@AccountID, @CourseID, @PurchasePrice);
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error in createEnrollment repository:', error);
    if (error.number === 2627 || error.number === 2601) {
      logger.warn(
        `Attempt to create duplicate enrollment: AccountID=${enrollmentData.AccountID}, CourseID=${enrollmentData.CourseID}`
      );
      return null;
    }
    throw error;
  }
};

/**
 * Tìm bản ghi đăng ký dựa trên AccountID và CourseID.
 * @param {number} accountId
 * @param {number} courseId
 * @returns {Promise<object|null>} - Enrollment hoặc null nếu không tìm thấy.
 */
const findEnrollmentByUserAndCourse = async (accountId, courseId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, accountId);
    request.input('CourseID', sql.BigInt, courseId);
    const result = await request.query(`
            SELECT *
            FROM Enrollments
            WHERE AccountID = @AccountID AND CourseID = @CourseID;
        `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(
      `Error finding enrollment for user ${accountId}, course ${courseId}:`,
      error
    );
    throw error;
  }
};

/**
 * Lấy danh sách các khóa học mà người dùng đã đăng ký, bao gồm bộ lọc status, sortBy, và searchTerm.
 * @param {number} accountId
 * @param {object} options - { page, limit, status, sortBy, searchTerm }
 * @returns {Promise<{ enrollments: object[], total: number }>}
 */
const findEnrollmentsByAccountId = async (accountId, options = {}) => {
  const {
    page = 1,
    limit = 10,
    status,
    sortBy = 'enrolledAt_desc',
    searchTerm,
  } = options;
  const offset = (page - 1) * limit;

  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, accountId);

    const whereClauses = ['e.AccountID = @AccountID'];

    if (status) {
      request.input('StatusID', sql.VarChar, status);
      whereClauses.push('c.StatusID = @StatusID');
    }

    if (searchTerm) {
      request.input('SearchTerm', sql.NVarChar, `%${searchTerm}%`);
      whereClauses.push(
        '(c.CourseName LIKE @SearchTerm OR c.ShortDescription LIKE @SearchTerm)'
      );
    }

    const whereCondition =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const commonQuery = `
      FROM Enrollments e
      JOIN Courses c ON e.CourseID = c.CourseID
      JOIN UserProfiles up ON c.InstructorID = up.AccountID
      ${whereCondition}
    `;

    const countResult = await request.query(
      `SELECT COUNT(e.EnrollmentID) as total ${commonQuery}`
    );
    const { total } = countResult.recordset[0];
    let orderByClause = 'ORDER BY e.EnrolledAt DESC';
    if (sortBy) {
      switch (sortBy) {
        case 'enrolledAt_desc':
          orderByClause = 'ORDER BY e.EnrolledAt DESC';
          break;
        case 'courseName_asc':
          orderByClause = 'ORDER BY c.CourseName ASC';
          break;
        case 'courseName_desc':
          orderByClause = 'ORDER BY c.CourseName DESC';
          break;
        case 'progress_desc':
          orderByClause = `
            ORDER BY 
              CAST(
                (
                  SELECT COUNT(*) 
                  FROM LessonProgress lp
                  JOIN Lessons l ON lp.LessonID = l.LessonID
                  JOIN Sections s ON l.SectionID = s.SectionID
                  WHERE lp.AccountID = @AccountID AND s.CourseID = c.CourseID AND lp.IsCompleted = 1
                ) AS FLOAT
              ) / NULLIF(
                (
                  SELECT COUNT(*) 
                  FROM Lessons l
                  JOIN Sections s ON l.SectionID = s.SectionID
                  WHERE s.CourseID = c.CourseID
                ), 0
              ) DESC
          `;
          break;
        case 'progress_asc':
          orderByClause = `
            ORDER BY 
              CAST(
                (
                  SELECT COUNT(*) 
                  FROM LessonProgress lp
                  JOIN Lessons l ON lp.LessonID = l.LessonID
                  JOIN Sections s ON l.SectionID = s.SectionID
                  WHERE lp.AccountID = @AccountID AND s.CourseID = c.CourseID AND lp.IsCompleted = 1
                ) AS FLOAT
              ) / NULLIF(
                (
                  SELECT COUNT(*) 
                  FROM Lessons l
                  JOIN Sections s ON l.SectionID = s.SectionID
                  WHERE s.CourseID = c.CourseID
                ), 0
              ) ASC
          `;
          break;
        default:
          orderByClause = 'ORDER BY e.EnrolledAt DESC';
      }
    }
    request.input('Limit', sql.Int, limit);
    request.input('Offset', sql.Int, offset);
    const dataResult = await request.query(`
  SELECT
    e.EnrollmentID, e.EnrolledAt, e.PurchasePrice,
    c.CourseID, c.CourseName, c.Slug, c.ThumbnailUrl, c.ShortDescription,
    up.FullName as InstructorName,
    (
      SELECT COUNT(*) 
      FROM Lessons l
      JOIN Sections s ON l.SectionID = s.SectionID
      WHERE s.CourseID = c.CourseID
    ) AS TotalLessons,
    (
      SELECT COUNT(*) 
      FROM LessonProgress lp
      JOIN Lessons l ON lp.LessonID = l.LessonID
      JOIN Sections s ON l.SectionID = s.SectionID
      WHERE lp.AccountID = @AccountID AND s.CourseID = c.CourseID AND lp.IsCompleted = 1
    ) AS CompletedLessons,
    (
      SELECT MAX(lp.CompletedAt)
      FROM LessonProgress lp
      JOIN Lessons l ON lp.LessonID = l.LessonID
      JOIN Sections s ON l.SectionID = s.SectionID
      WHERE lp.AccountID = @AccountID AND s.CourseID = c.CourseID AND lp.IsCompleted = 1
    ) AS LastCompletedLessonAt
  ${commonQuery}
  ${orderByClause}
  OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
`);

    return { enrollments: dataResult.recordset, total };
  } catch (error) {
    logger.error(`Error finding enrollments for user ${accountId}:`, error);
    throw error;
  }
};

/**
 * Đếm tổng số học viên duy nhất đã đăng ký các khóa của một giảng viên.
 * @param {number} instructorId
 * @param {object} [transaction=null]
 * @returns {Promise<number>}
 */
const countTotalUniqueStudentsForInstructor = async (
  instructorId,
  transaction = null
) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('InstructorID', sql.BigInt, instructorId);
  try {
    const result = await executor.query(`
            SELECT COUNT(DISTINCT e.AccountID) as totalStudents
            FROM Enrollments e
            JOIN Courses c ON e.CourseID = c.CourseID
            WHERE c.InstructorID = @InstructorID;
        `);
    return result.recordset[0].totalStudents;
  } catch (error) {
    logger.error(
      `Error counting total unique students for instructor ${instructorId}:`,
      error
    );
    throw error;
  }
};

module.exports = {
  createEnrollment,
  findEnrollmentByUserAndCourse,
  findEnrollmentsByAccountId,
  countTotalUniqueStudentsForInstructor,
};
