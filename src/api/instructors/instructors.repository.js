const httpStatus = require('http-status').status;
const Roles = require('../../core/enums/Roles');
const ApiError = require('../../core/errors/ApiError');
const { getConnection, sql } = require('../../database/connection');
const { toCamelCaseObject } = require('../../utils/caseConverter');
const logger = require('../../utils/logger');
/**
 * Tìm hoặc tạo InstructorProfile.
 * @param {number} accountId
 * @param {object} defaults - Dữ liệu mặc định nếu tạo mới (rỗng).
 * @param {object} [transaction=null]
 * @returns {Promise<object>}
 */
const findOrCreateInstructorProfile = async (accountId, transaction = null) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('AccountID', sql.BigInt, accountId);
  try {
    let result = await executor.query(
      'SELECT * FROM InstructorProfiles WHERE AccountID = @AccountID;'
    );
    if (result.recordset[0]) {
      return result.recordset[0];
    }
    const createExecutor = transaction
      ? transaction.request()
      : (await getConnection()).request();
    createExecutor.input('AccountID', sql.BigInt, accountId);
    result = await createExecutor.query(`
                 INSERT INTO InstructorProfiles (AccountID) OUTPUT Inserted.* VALUES (@AccountID);
             `);
    return result.recordset[0];
  } catch (error) {
    logger.error(
      `Error in findOrCreateInstructorProfile for ${accountId}:`,
      error
    );
    throw error;
  }
};

/**
 * Cập nhật InstructorProfile.
 * @param {number} accountId
 * @param {object} updateData
 * @param {object} [transaction=null]
 * @returns {Promise<object|null>} - Profile đã cập nhật hoặc null nếu không có gì thay đổi.
 */
const updateInstructorProfile = async (
  accountId,
  updateData,
  transaction = null
) => {
  await findOrCreateInstructorProfile(accountId, transaction);

  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('AccountID', sql.BigInt, accountId);
  executor.input('UpdatedAt', sql.DateTime2, new Date());

  const setClauses = ['UpdatedAt = @UpdatedAt'];
  Object.keys(updateData).forEach((key) => {
    if (key !== 'AccountID' && key !== 'CreatedAt') {
      const value = updateData[key];
      let sqlType;

      if (
        ['ProfessionalTitle', 'BankName', 'BankAccountHolderName'].includes(key)
      )
        sqlType = sql.NVarChar;
      else if (['Bio', 'AboutMe'].includes(key)) sqlType = sql.NVarChar;
      else if (['BankAccountNumber'].includes(key)) sqlType = sql.VarChar;
      else if (['LastBalanceUpdate'].includes(key)) sqlType = sql.DateTime2;
      else return;

      executor.input(key, sqlType, value);
      setClauses.push(`${key} = @${key}`);
    }
  });

  if (setClauses.length === 1) return null;

  try {
    const result = await executor.query(`
            UPDATE InstructorProfiles
            SET ${setClauses.join(', ')}
            OUTPUT Inserted.*
            WHERE AccountID = @AccountID;
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error(`Error updating instructor profile ${accountId}:`, error);
    throw error;
  }
};

const addInstructorSkill = async (accountId, skillId, transaction = null) => {
  try {
    const executor = transaction
      ? transaction.request()
      : (await getConnection()).request();
    executor.input('AccountID', sql.BigInt, accountId);
    executor.input('SkillID', sql.Int, skillId);
    await executor.query(`
        INSERT INTO InstructorSkills (AccountID, SkillID) VALUES (@AccountID, @SkillID);
    `);
    return { AccountID: accountId, SkillID: skillId };
  } catch (error) {
    if (error.number === 2627 || error.number === 2601) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Giảng viên đã có kỹ năng này.'
      );
    }
    logger.error(
      `Error adding skill ${skillId} for instructor ${accountId}:`,
      error
    );
    throw error;
  }
};

const removeInstructorSkill = async (accountId, skillId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, accountId);
    request.input('SkillID', sql.Int, skillId);
    const result = await request.query(`
            DELETE FROM InstructorSkills WHERE AccountID = @AccountID AND SkillID = @SkillID;
        `);
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(
      `Error removing skill ${skillId} for instructor ${accountId}:`,
      error
    );
    throw error;
  }
};

const findInstructorSkills = async (accountId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, accountId);
    const result = await request.query(`
            SELECT s.SkillID, s.SkillName
            FROM InstructorSkills insk
            JOIN Skills s ON insk.SkillID = s.SkillID
            WHERE insk.AccountID = @AccountID;
        `);
    return result.recordset;
  } catch (error) {
    logger.error(`Error finding skills for instructor ${accountId}:`, error);
    throw error;
  }
};

const createOrUpdateSocialLink = async (
  accountId,
  platform,
  url,
  transaction = null
) => {
  try {
    const executor = transaction
      ? transaction.request()
      : (await getConnection()).request();
    executor.input('AccountID', sql.BigInt, accountId);
    executor.input('Platform', sql.VarChar, platform);
    executor.input('Url', sql.NVarChar, url);
    const result = await executor.query(`
            MERGE InstructorSocialLinks AS target
            USING (VALUES (@AccountID, @Platform, @Url)) AS source (AccountID, Platform, Url)
            ON target.AccountID = source.AccountID AND target.Platform = source.Platform
            WHEN MATCHED THEN
                UPDATE SET Url = source.Url
            WHEN NOT MATCHED THEN
                INSERT (AccountID, Platform, Url) VALUES (source.AccountID, source.Platform, source.Url)
            OUTPUT Inserted.*;
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error(
      `Error creating/updating social link for ${accountId}, platform ${platform}:`,
      error
    );
    throw error;
  }
};

const removeSocialLink = async (accountId, platform) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, accountId);
    request.input('Platform', sql.VarChar, platform);
    const result = await request.query(`
            DELETE FROM InstructorSocialLinks WHERE AccountID = @AccountID AND Platform = @Platform;
        `);
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(
      `Error removing social link for ${accountId}, platform ${platform}:`,
      error
    );
    throw error;
  }
};

const findInstructorSocialLinks = async (accountId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, accountId);
    const result = await request.query(`
            SELECT Platform, Url FROM InstructorSocialLinks WHERE AccountID = @AccountID;
        `);
    return result.recordset;
  } catch (error) {
    logger.error(
      `Error finding social links for instructor ${accountId}:`,
      error
    );
    throw error;
  }
};

/**
 * Lấy thông tin đầy đủ của instructor (public view).
 * @param {number} instructorId
 * @returns {Promise<object|null>}
 */
const findInstructorPublicProfile = async (instructorId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, instructorId);
    request.input('InstructorRoleID', sql.VarChar, 'GV');
    const profileResult = await request.query(`
            SELECT
                up.FullName, up.AvatarUrl, up.CoverImageUrl, up.Headline, up.Location,
                ip.ProfessionalTitle, ip.Bio, ip.AboutMe,
                a.CreatedAt as MemberSince
            FROM Accounts a
            JOIN UserProfiles up ON a.AccountID = up.AccountID
            LEFT JOIN InstructorProfiles ip ON a.AccountID = ip.AccountID
            WHERE a.AccountID = @AccountID AND a.RoleID = @InstructorRoleID AND a.Status = 'ACTIVE';
        `);
    const profile = profileResult.recordset[0];
    if (!profile) return null;

    const skills = await findInstructorSkills(instructorId);
    profile.skills = skills;

    const socialLinks = await findInstructorSocialLinks(instructorId);
    profile.socialLinks = socialLinks;

    const courseCountResult = await request.query(`
      SELECT COUNT(*) AS TotalCourses
      FROM Courses
      WHERE InstructorID = @AccountID AND StatusID = 'PUBLISHED';
    `);
    profile.totalCourses = courseCountResult.recordset[0]?.TotalCourses || 0;

    const studentCountResult = await request.query(`
      SELECT COUNT(DISTINCT e.AccountID) AS TotalStudents
      FROM Enrollments e
      JOIN Courses c ON e.CourseID = c.CourseID
      WHERE c.InstructorID = @AccountID AND c.StatusID = 'PUBLISHED';
    `);
    profile.totalStudents = studentCountResult.recordset[0]?.TotalStudents || 0;

    const averageRatingResult = await request.query(`
      SELECT AVG(c.AverageRating) AS AverageRating
      FROM Courses c
      WHERE c.InstructorID = @AccountID AND c.StatusID = 'PUBLISHED' AND c.AverageRating IS NOT NULL;
    `);
    profile.averageRating = parseFloat(
      averageRatingResult.recordset[0]?.AverageRating || 0
    ).toFixed(2);
    return profile;
  } catch (error) {
    logger.error(
      `Error finding public profile for instructor ${instructorId}:`,
      error
    );
    throw error;
  }
};

/**
 * Lấy thông tin tài khoản ngân hàng của instructor.
 * @param {number} accountId
 * @returns {Promise<{BankAccountNumber: string, BankName: string, BankAccountHolderName: string}|null>}
 */
const getInstructorBankInfo = async (accountId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, accountId);
    const result = await request.query(`
          SELECT BankAccountNumber, BankName, BankAccountHolderName
          FROM InstructorProfiles
          WHERE AccountID = @AccountID;
      `);
    return (
      result.recordset[0] || {
        BankAccountNumber: null,
        BankName: null,
        BankAccountHolderName: null,
      }
    );
  } catch (error) {
    logger.error(`Error getting bank info for instructor ${accountId}:`, error);
    throw error;
  }
};

/**
 * Find all instructors with filtering, pagination, and calculated fields.
 * @param {object} filterOptions - { searchTerm, skillId, minRating }
 * @param {object} paginationOptions - { page, limit, sortBy }
 * @returns {Promise<InstructorListResponse>}
 */
const findAllInstructors = async (
  filterOptions = {},
  paginationOptions = {}
) => {
  const { searchTerm, skillId, minRating } = filterOptions;
  const { page = 1, limit = 10, sortBy = 'rating:desc' } = paginationOptions;
  const offset = (page - 1) * limit;

  try {
    const pool = await getConnection();
    const request = pool.request();

    request.input('InstructorRoleID', sql.VarChar, Roles.INSTRUCTOR);

    const whereClauses = [`acc.RoleID = @InstructorRoleID`];
    let joinClauses = `
      JOIN UserProfiles up ON acc.AccountID = up.AccountID
      LEFT JOIN InstructorProfiles ip ON acc.AccountID = ip.AccountID
      LEFT JOIN (
          SELECT c.InstructorID, AVG(CAST(cr.Rating AS FLOAT)) as AvgRating
          FROM CourseReviews cr
          JOIN Courses c ON cr.CourseID = c.CourseID
          WHERE c.InstructorID IS NOT NULL
          GROUP BY c.InstructorID
      ) AS instructor_ratings ON acc.AccountID = instructor_ratings.InstructorID
      LEFT JOIN (
          SELECT c.InstructorID, COUNT(DISTINCT e.AccountID) as TotalStudents
          FROM Courses c
          JOIN Enrollments e ON c.CourseID = e.CourseID
          WHERE c.InstructorID IS NOT NULL
          GROUP BY c.InstructorID
      ) AS student_counts ON acc.AccountID = student_counts.InstructorID
      LEFT JOIN (
          SELECT InstructorID, COUNT(CourseID) as TotalCourses
          FROM Courses
          WHERE InstructorID IS NOT NULL AND StatusID = 'PUBLISHED'
          GROUP BY InstructorID
      ) AS course_counts ON acc.AccountID = course_counts.InstructorID
    `;

    if (skillId) {
      request.input('SkillID', sql.Int, skillId);
      joinClauses += `
        JOIN InstructorSkills insk ON acc.AccountID = insk.AccountID
      `;
      whereClauses.push('insk.SkillID = @SkillID');
    }

    if (searchTerm) {
      request.input('SearchTerm', sql.NVarChar, `%${searchTerm}%`);
      whereClauses.push(
        '(up.FullName LIKE @SearchTerm OR up.Headline LIKE @SearchTerm OR ip.ProfessionalTitle LIKE @SearchTerm)'
      );
    }

    if (typeof minRating === 'number') {
      request.input('MinRating', sql.Float, minRating);
      whereClauses.push(
        'ISNULL(instructor_ratings.AvgRating, 0) >= @MinRating'
      );
    }

    const whereCondition =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(DISTINCT acc.AccountID) as total
      FROM Accounts acc
      ${joinClauses}
      ${whereCondition};
    `;
    const countResult = await request.query(countQuery);
    const total = countResult.recordset[0] ? countResult.recordset[0].total : 0;

    let orderByClause =
      'ORDER BY ISNULL(instructor_ratings.AvgRating, 0) DESC, acc.AccountID ASC';
    if (sortBy) {
      const [field, order] = sortBy.split(':');
      const sortOrder = order?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      switch (field) {
        case 'rating':
          orderByClause = `ORDER BY ISNULL(instructor_ratings.AvgRating, 0) ${sortOrder}, acc.AccountID ${sortOrder}`;
          break;
        case 'studentCount':
          orderByClause = `ORDER BY ISNULL(student_counts.TotalStudents, 0) ${sortOrder}, acc.AccountID ${sortOrder}`;
          break;
        case 'courseCount':
          orderByClause = `ORDER BY ISNULL(course_counts.TotalCourses, 0) ${sortOrder}, acc.AccountID ${sortOrder}`;
          break;
        case 'name':
          orderByClause = `ORDER BY up.FullName ${sortOrder}, acc.AccountID ${sortOrder}`;
          break;
        default:
          break;
      }
    }

    const dataQuery = `
      SELECT
        acc.AccountID,
        up.FullName,
        up.AvatarUrl,
        ip.ProfessionalTitle,
        up.Headline,
        ISNULL(instructor_ratings.AvgRating, NULL) as AverageRating,
        ISNULL(student_counts.TotalStudents, 0) as TotalStudents,
        ISNULL(course_counts.TotalCourses, 0) as TotalCourses
      FROM Accounts acc
      ${joinClauses}
      ${whereCondition}
      ${orderByClause}
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
    `;
    request.input('Offset', sql.Int, offset);
    request.input('Limit', sql.Int, limit);

    const dataResult = await request.query(dataQuery);
    const instructorsRaw = dataResult.recordset;

    const instructorList = [];
    if (instructorsRaw.length > 0) {
      const instructorAccountIDs = instructorsRaw.map((inst) => inst.AccountID);

      const allSkillsRequest = pool.request();
      const accountIdParams = instructorAccountIDs
        .map((id, index) => `@SkillAccountID_${index}`)
        .join(',');
      instructorAccountIDs.forEach((id, index) => {
        allSkillsRequest.input(`SkillAccountID_${index}`, sql.BigInt, id);
      });

      const allSkillsResult = await allSkillsRequest.query(`
            SELECT insk.AccountID, sk.SkillID, sk.SkillName
            FROM InstructorSkills insk
            JOIN Skills sk ON insk.SkillID = sk.SkillID
            WHERE insk.AccountID IN (${accountIdParams})
            ORDER BY insk.AccountID;
        `);

      const skillsByInstructor = allSkillsResult.recordset.reduce(
        (acc, skill) => {
          if (!acc[skill.AccountID]) {
            acc[skill.AccountID] = [];
          }
          if (acc[skill.AccountID].length < 3) {
            acc[skill.AccountID].push(
              toCamelCaseObject({
                skillId: skill.SkillID,
                skillName: skill.SkillName,
              })
            );
          }
          return acc;
        },
        {}
      );

      for (const instructor of instructorsRaw) {
        instructorList.push({
          ...toCamelCaseObject(instructor),
          mainSkills: skillsByInstructor[instructor.AccountID] || [],
        });
      }
    }

    return {
      instructors: instructorList,
      total,
      page,
      limit,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 1,
    };
  } catch (error) {
    logger.error('Error in findAllInstructors repository:', error);
    throw error;
  }
};

const findStudentsOfInstructor = async ({
  instructorId,
  page = 1,
  limit = 10,
  searchTerm = '',
  status,
  courseId,
  sortBy = 'fullName:asc',
}) => {
  const pool = await getConnection();
  const request = pool.request();

  request.input('InstructorID', sql.BigInt, instructorId);
  request.input('Page', sql.Int, page);
  request.input('Limit', sql.Int, limit);
  request.input(
    'SearchTerm',
    sql.NVarChar,
    searchTerm ? `%${searchTerm}%` : null
  );
  request.input('AccountStatus', sql.VarChar(20), status || null);
  request.input('FilterCourseID', sql.BigInt, courseId || null);
  request.input('SortBy', sql.NVarChar(100), sortBy);

  const optimizedQuery = `
    DECLARE @Offset INT = (@Page - 1) * @Limit;
    DECLARE @OrderByColumn NVARCHAR(100) = 'up.FullName';
    DECLARE @OrderByDirection NVARCHAR(4) = 'ASC';

    IF @SortBy IS NOT NULL AND @SortBy <> ''
    BEGIN
        DECLARE @SortField NVARCHAR(100) = SUBSTRING(@SortBy, 1, CASE WHEN CHARINDEX(':', @SortBy) = 0 THEN LEN(@SortBy) + 1 ELSE CHARINDEX(':', @SortBy) END - 1);
        DECLARE @SortDirectionInput NVARCHAR(4) = CASE WHEN CHARINDEX(':', @SortBy) > 0 THEN SUBSTRING(@SortBy, CHARINDEX(':', @SortBy) + 1, LEN(@SortBy)) ELSE 'asc' END;
        
        SET @OrderByDirection = CASE WHEN LOWER(@SortDirectionInput) = 'desc' THEN 'DESC' ELSE 'ASC' END;

        SET @OrderByColumn = CASE @SortField
            WHEN 'fullName' THEN 'up.FullName'
            WHEN 'lastLearningActivityTimestamp' THEN 'sm.MaxLastWatchedAt'
            WHEN 'averageCompletionRate' THEN 'sm.AvgStudentCourseCompletion'
            WHEN 'enrolledCoursesCount' THEN 'sm.EnrolledCoursesCount'
            ELSE 'up.FullName'
        END;
    END;

    WITH 
    FilteredStudentAccounts_CTE AS (
        SELECT DISTINCT a.AccountID
        FROM Accounts a
        INNER JOIN UserProfiles up ON a.AccountID = up.AccountID
        INNER JOIN Enrollments e ON a.AccountID = e.AccountID
        INNER JOIN Courses c ON e.CourseID = c.CourseID 
        WHERE c.InstructorID = @InstructorID
          AND (@FilterCourseID IS NULL OR c.CourseID = @FilterCourseID)
          AND (@SearchTerm IS NULL OR (up.FullName LIKE @SearchTerm OR a.Email LIKE @SearchTerm))
          AND (@AccountStatus IS NULL OR a.Status = @AccountStatus)
    ),
    StudentMetrics_CTE AS (
        SELECT
            fsa.AccountID,
            MAX(lp.LastWatchedAt) AS MaxLastWatchedAt,
            COUNT(DISTINCT e_metrics.CourseID) AS EnrolledCoursesCount,
            AVG(
                CASE 
                    WHEN TotalLessonsInCourse.Total > 0 THEN 
                        CAST(CompletedLessonsInCourse.Completed AS FLOAT) * 100.0 / TotalLessonsInCourse.Total 
                    ELSE NULL 
                END
            ) AS AvgStudentCourseCompletion
        FROM FilteredStudentAccounts_CTE fsa
        LEFT JOIN Enrollments e_metrics ON fsa.AccountID = e_metrics.AccountID
        LEFT JOIN Courses c_metrics ON e_metrics.CourseID = c_metrics.CourseID AND c_metrics.InstructorID = @InstructorID
        LEFT JOIN LessonProgress lp ON e_metrics.AccountID = lp.AccountID AND e_metrics.CourseID = c_metrics.CourseID AND lp.LessonID IN (SELECT l_inner.LessonID FROM Lessons l_inner JOIN Sections s_inner ON l_inner.SectionID = s_inner.SectionID WHERE s_inner.CourseID = c_metrics.CourseID)
        OUTER APPLY (
            SELECT COUNT(lp_completed.LessonID) AS Completed
            FROM LessonProgress lp_completed
            INNER JOIN Lessons l_completed ON lp_completed.LessonID = l_completed.LessonID
            INNER JOIN Sections s_completed ON l_completed.SectionID = s_completed.SectionID
            WHERE s_completed.CourseID = c_metrics.CourseID 
              AND lp_completed.AccountID = fsa.AccountID 
              AND lp_completed.IsCompleted = 1
        ) AS CompletedLessonsInCourse
        OUTER APPLY (
            SELECT COUNT(l_total.LessonID) AS Total
            FROM Lessons l_total
            INNER JOIN Sections s_total ON l_total.SectionID = s_total.SectionID
            WHERE s_total.CourseID = c_metrics.CourseID
        ) AS TotalLessonsInCourse
        GROUP BY fsa.AccountID
    ),
    TotalCount_CTE AS (
        SELECT COUNT(*) as TotalRows FROM FilteredStudentAccounts_CTE
    )
    SELECT
        a.AccountID as accountId,
        up.FullName as fullName,
        up.AvatarUrl as avatarUrl,
        a.Email as email,
        ISNULL(sm.EnrolledCoursesCount, 0) as enrolledCoursesCount,
        sm.AvgStudentCourseCompletion as averageCompletionRate,
        sm.MaxLastWatchedAt as lastLearningActivityTimestamp,
        a.Status as status,
        (SELECT TotalRows FROM TotalCount_CTE) as totalCount
    FROM Accounts a
    INNER JOIN UserProfiles up ON a.AccountID = up.AccountID
    INNER JOIN FilteredStudentAccounts_CTE fsa ON a.AccountID = fsa.AccountID
    LEFT JOIN StudentMetrics_CTE sm ON a.AccountID = sm.AccountID
    ORDER BY 
        CASE WHEN @OrderByColumn = 'up.FullName' AND @OrderByDirection = 'ASC' THEN up.FullName END ASC,
        CASE WHEN @OrderByColumn = 'up.FullName' AND @OrderByDirection = 'DESC' THEN up.FullName END DESC,
        CASE WHEN @OrderByColumn = 'sm.MaxLastWatchedAt' AND @OrderByDirection = 'ASC' THEN sm.MaxLastWatchedAt END ASC,
        CASE WHEN @OrderByColumn = 'sm.MaxLastWatchedAt' AND @OrderByDirection = 'DESC' THEN sm.MaxLastWatchedAt END DESC,
        CASE WHEN @OrderByColumn = 'sm.AvgStudentCourseCompletion' AND @OrderByDirection = 'ASC' THEN sm.AvgStudentCourseCompletion END ASC,
        CASE WHEN @OrderByColumn = 'sm.AvgStudentCourseCompletion' AND @OrderByDirection = 'DESC' THEN sm.AvgStudentCourseCompletion END DESC,
        CASE WHEN @OrderByColumn = 'sm.EnrolledCoursesCount' AND @OrderByDirection = 'ASC' THEN sm.EnrolledCoursesCount END ASC,
        CASE WHEN @OrderByColumn = 'sm.EnrolledCoursesCount' AND @OrderByDirection = 'DESC' THEN sm.EnrolledCoursesCount END DESC
    OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
  `;
  const result = await request.query(optimizedQuery);
  const total =
    result.recordset.length > 0 ? result.recordset[0].totalCount : 0;

  const students = result.recordset.map(
    ({ totalCount, ...student }) => student
  );

  return {
    students,
    total,
  };
};
module.exports = {
  findOrCreateInstructorProfile,
  updateInstructorProfile,
  addInstructorSkill,
  removeInstructorSkill,
  findInstructorSkills,
  createOrUpdateSocialLink,
  removeSocialLink,
  findInstructorSocialLinks,
  findInstructorPublicProfile,
  getInstructorBankInfo,
  findAllInstructors,
  findStudentsOfInstructor,
};
