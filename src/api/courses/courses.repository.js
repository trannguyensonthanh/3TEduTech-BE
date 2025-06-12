// File: src/api/courses/courses.repository.js
const httpStatus = require('http-status').status;
const ApiError = require('../../core/errors/ApiError');
const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');
const CourseStatus = require('../../core/enums/CourseStatus');
const sectionRepository = require('../sections/sections.repository');

/**
 * Tạo khóa học mới (thường là bản nháp).
 */
const createCourse = async (courseData, transaction = null) => {
  const statusId = courseData.StatusID || CourseStatus.DRAFT;
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();

  executor.input('CourseName', sql.NVarChar, courseData.CourseName);
  executor.input('Slug', sql.NVarChar, courseData.Slug);
  executor.input('ShortDescription', sql.NVarChar, courseData.ShortDescription);
  executor.input('FullDescription', sql.NVarChar, courseData.FullDescription);
  executor.input('Requirements', sql.NVarChar, courseData.Requirements);
  executor.input('LearningOutcomes', sql.NVarChar, courseData.LearningOutcomes);
  executor.input('ThumbnailUrl', sql.VarChar, courseData.ThumbnailUrl);
  executor.input('IntroVideoUrl', sql.VarChar, courseData.IntroVideoUrl);
  executor.input('OriginalPrice', sql.Decimal(18, 4), courseData.OriginalPrice);
  executor.input(
    'DiscountedPrice',
    sql.Decimal(18, 4),
    courseData.DiscountedPrice
  );
  executor.input('InstructorID', sql.BigInt, courseData.InstructorID);
  executor.input('CategoryID', sql.Int, courseData.CategoryID);
  executor.input('LevelID', sql.Int, courseData.LevelID);
  executor.input('Language', sql.VarChar, courseData.Language || 'vi');
  executor.input('StatusID', sql.VarChar, statusId);
  executor.input('IsFeatured', sql.Bit, courseData.IsFeatured || 0);

  try {
    const result = await executor.query(`
            INSERT INTO Courses (
                CourseName, Slug, ShortDescription, FullDescription, Requirements, LearningOutcomes,
                ThumbnailUrl, IntroVideoUrl, OriginalPrice, DiscountedPrice, InstructorID,
                CategoryID, LevelID, Language, StatusID, IsFeatured
            )
            OUTPUT Inserted.*
            VALUES (
                @CourseName, @Slug, @ShortDescription, @FullDescription, @Requirements, @LearningOutcomes,
                @ThumbnailUrl, @IntroVideoUrl, @OriginalPrice, @DiscountedPrice, @InstructorID,
                @CategoryID, @LevelID, @Language, @StatusID, @IsFeatured
            );
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error in createCourse repository:', error);
    throw error;
  }
};

/**
 * Tìm khóa học bằng ID.
 */
const findCourseById = async (courseId, includeDraft = false) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CourseID', sql.BigInt, courseId);

    let query = `
            SELECT c.*, cat.CategoryName, lvl.LevelName, cs.StatusName,
                   acc.Email as InstructorEmail, up.FullName as InstructorName, up.AvatarUrl as InstructorAvatar
            FROM Courses c
            JOIN Categories cat ON c.CategoryID = cat.CategoryID
            JOIN Levels lvl ON c.LevelID = lvl.LevelID
            JOIN CourseStatuses cs ON c.StatusID = cs.StatusID
            JOIN Accounts acc ON c.InstructorID = acc.AccountID
            JOIN UserProfiles up ON c.InstructorID = up.AccountID
            WHERE c.CourseID = @CourseID
        `;

    if (!includeDraft) {
      request.input('PublishedStatus', sql.VarChar, CourseStatus.PUBLISHED);
      query += ' AND c.StatusID = @PublishedStatus';
    }

    const result = await request.query(query);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error in findCourseById (${courseId}):`, error);
    throw error;
  }
};

/**
 * Tìm khóa học bằng Slug.
 */
const findCourseBySlug = async (slug, includeDraft = false) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('Slug', sql.NVarChar, slug);

    let query = `
            SELECT c.*, cat.CategoryName, lvl.LevelName, cs.StatusName,
                   acc.Email as InstructorEmail, up.FullName as InstructorName, up.AvatarUrl as InstructorAvatar
            FROM Courses c
            JOIN Categories cat ON c.CategoryID = cat.CategoryID
            JOIN Levels lvl ON c.LevelID = lvl.LevelID
            JOIN CourseStatuses cs ON c.StatusID = cs.StatusID
            JOIN Accounts acc ON c.InstructorID = acc.AccountID
            JOIN UserProfiles up ON c.InstructorID = up.AccountID
            WHERE c.Slug = @Slug
        `;

    if (!includeDraft) {
      request.input('PublishedStatus', sql.VarChar, CourseStatus.PUBLISHED);
      query += ' AND c.StatusID = @PublishedStatus';
    }

    const result = await request.query(query);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error in findCourseBySlug (${slug}):`, error);
    throw error;
  }
};

/**
 * Tìm khóa học chỉ bằng Slug (kiểm tra tồn tại slug).
 */
const findCourseIdBySlug = async (slug) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('Slug', sql.NVarChar, slug);
    const result = await request.query(
      'SELECT CourseID, Slug FROM Courses WHERE Slug = @Slug'
    );
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error in findCourseIdBySlug (${slug}):`, error);
    throw error;
  }
};

/**
 * Lấy danh sách khóa học với bộ lọc và phân trang.
 */
const findAllCourses = async (filters = {}, options = {}) => {
  const {
    categoryId,
    levelId,
    instructorId,
    statusId = CourseStatus.PUBLISHED,
    isFeatured,
    searchTerm,
    language,
  } = filters;
  const { page = 1, limit = 10, sortBy = 'CreatedAt:desc' } = options;
  const offset = (page - 1) * limit;
  try {
    const pool = await getConnection();
    const request = pool.request();

    let query = `
      SELECT
        c.CourseID,
        c.CourseName,
        c.Slug,
        c.ShortDescription,
        c.FullDescription,
        c.Requirements,
        c.LearningOutcomes,
        c.ThumbnailUrl,
        c.IntroVideoUrl,
        c.OriginalPrice,
        c.DiscountedPrice,
        c.Language,
        c.StatusID,
        c.PublishedAt,
        c.IsFeatured,
        c.CreatedAt,
        c.UpdatedAt,
        c.AverageRating,
        c.ReviewCount,
        cat.CategoryName,
        lvl.LevelName,
        cs.StatusName,
        up.AccountID AS InstructorAccountID,
        up.FullName AS InstructorName,
        up.AvatarUrl AS InstructorAvatar,
        COUNT(e.EnrollmentID) AS StudentCount
      FROM Courses c
      JOIN Categories cat ON c.CategoryID = cat.CategoryID
      JOIN Levels lvl ON c.LevelID = lvl.LevelID
      JOIN CourseStatuses cs ON c.StatusID = cs.StatusID
      JOIN UserProfiles up ON c.InstructorID = up.AccountID
      LEFT JOIN Enrollments e ON c.CourseID = e.CourseID
    `;

    let countQuery = `
      SELECT COUNT(DISTINCT c.CourseID) AS total
      FROM Courses c
      JOIN Categories cat ON c.CategoryID = cat.CategoryID
      JOIN Levels lvl ON c.LevelID = lvl.LevelID
      JOIN CourseStatuses cs ON c.StatusID = cs.StatusID
      JOIN UserProfiles up ON c.InstructorID = up.AccountID
    `;

    const whereClauses = [];

    if (statusId && statusId.toUpperCase() !== 'ALL') {
      request.input('StatusID', sql.VarChar, statusId);
      whereClauses.push('c.StatusID = @StatusID');
    }
    if (categoryId) {
      request.input('CategoryID', sql.Int, categoryId);
      whereClauses.push('c.CategoryID = @CategoryID');
    }
    if (levelId) {
      request.input('LevelID', sql.Int, levelId);
      whereClauses.push('c.LevelID = @LevelID');
    }
    if (instructorId) {
      request.input('InstructorID', sql.BigInt, instructorId);
      whereClauses.push('c.InstructorID = @InstructorID');
    }
    if (isFeatured !== undefined) {
      request.input('IsFeatured', sql.Bit, Number(isFeatured));
      whereClauses.push('c.IsFeatured = @IsFeatured');
    }
    if (searchTerm) {
      request.input('Search', sql.NVarChar, `%${searchTerm}%`);
      whereClauses.push(
        '(c.CourseName LIKE @Search OR c.ShortDescription LIKE @Search OR up.FullName LIKE @Search)'
      );
    }
    if (language) {
      request.input('Language', sql.VarChar, language);
      whereClauses.push('c.Language = @Language');
    }

    const whereCondition =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    query += whereCondition;
    countQuery += whereCondition;

    query += `
      GROUP BY
        c.CourseID, c.CourseName, c.Slug, c.ShortDescription, c.FullDescription,
        c.Requirements, c.LearningOutcomes, c.ThumbnailUrl, c.IntroVideoUrl,
        c.OriginalPrice, c.DiscountedPrice, c.Language, c.StatusID, c.PublishedAt,
        c.IsFeatured, c.CreatedAt, c.UpdatedAt, c.AverageRating, c.ReviewCount,
        cat.CategoryName, lvl.LevelName, cs.StatusName, up.AccountID, up.FullName, up.AvatarUrl
    `;

    let orderByClause = 'ORDER BY c.CreatedAt DESC';
    if (sortBy) {
      const [sortField, sortOrder] = sortBy.split(':');
      const allowedSortFields = {
        CreatedAt: 'c.CreatedAt',
        PublishedAt: 'c.PublishedAt',
        Price: 'ISNULL(c.DiscountedPrice, c.OriginalPrice)',
        Name: 'c.CourseName',
      };
      const orderDirection =
        sortOrder?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      if (allowedSortFields[sortField]) {
        orderByClause = `ORDER BY ${allowedSortFields[sortField]} ${orderDirection}`;
      }
    }
    query += ` ${orderByClause}`;

    if (limit > 0) {
      request.input('Limit', sql.Int, limit);
      request.input('Offset', sql.Int, offset);
      query += ' OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY';
    }

    const countResult = await request.query(countQuery);
    const { total } = countResult.recordset[0];

    const dataResult = await request.query(query);
    const courses = dataResult.recordset;
    return { courses, total };
  } catch (error) {
    logger.error('Error in findAllCourses repository:', error);
    throw error;
  }
};

/**
 * Cập nhật khóa học bằng ID.
 */
const updateCourseById = async (courseId, updateData, transaction = null) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('CourseID', sql.BigInt, courseId);
  executor.input('UpdatedAt', sql.DateTime2, new Date());

  const setClauses = ['UpdatedAt = @UpdatedAt'];

  const keys = Object.keys(updateData);
  keys.forEach((key) => {
    if (key !== 'CourseID' && key !== 'InstructorID' && key !== 'CreatedAt') {
      const value = updateData[key];
      let sqlType;
      if (
        [
          'CourseName',
          'Slug',
          'ShortDescription',
          'FullDescription',
          'Requirements',
          'LearningOutcomes',
        ].includes(key)
      )
        sqlType = sql.NVarChar;
      else if (
        ['ThumbnailUrl', 'IntroVideoUrl', 'Language', 'StatusID'].includes(key)
      )
        sqlType = sql.VarChar;
      else if (['OriginalPrice', 'DiscountedPrice'].includes(key))
        sqlType = sql.Decimal(18, 4);
      else if (['CategoryID', 'LevelID'].includes(key)) sqlType = sql.Int;
      else if (['PublishedAt'].includes(key)) sqlType = sql.DateTime2;
      else if (['IsFeatured'].includes(key)) sqlType = sql.Bit;
      else if (['LiveCourseID'].includes(key)) sqlType = sql.BigInt;
      else return;

      executor.input(key, sqlType, value);
      setClauses.push(`${key} = @${key}`);
    }
  });

  if (setClauses.length === 1) return null;

  const query = `
        UPDATE Courses
        SET ${setClauses.join(', ')}
        OUTPUT Inserted.*
        WHERE CourseID = @CourseID;
    `;

  try {
    const result = await executor.query(query);
    return result.recordset[0];
  } catch (error) {
    logger.error(`Error updating course ${courseId}:`, error);
    throw error;
  }
};

/**
 * Xóa khóa học bằng ID (Cân nhắc xóa mềm).
 */
const deleteCourseById = async (courseId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CourseID', sql.BigInt, courseId);
    const result = await request.query(
      'DELETE FROM Courses WHERE CourseID = @CourseID'
    );
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error deleting course ${courseId}:`, error);
    if (error.number === 547) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Không thể xóa khóa học vì có dữ liệu liên quan (học viên đăng ký, bài học,...). Cân nhắc lưu trữ khóa học thay vì xóa.'
      );
    }
    throw error;
  }
};

/**
 * Tạo yêu cầu phê duyệt khóa học.
 */
const createCourseApprovalRequest = async ({
  courseId,
  instructorId,
  requestType,
  instructorNotes,
}) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CourseID', sql.BigInt, courseId);
    request.input('InstructorID', sql.BigInt, instructorId);
    request.input('RequestType', sql.VarChar, requestType);
    request.input('InstructorNotes', sql.NVarChar, instructorNotes);

    const result = await request.query(`
            INSERT INTO CourseApprovalRequests (CourseID, InstructorID, RequestType, InstructorNotes)
            OUTPUT Inserted.*
            VALUES (@CourseID, @InstructorID, @RequestType, @InstructorNotes);
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error creating course approval request:', error);
    throw error;
  }
};

/**
 * Tìm yêu cầu phê duyệt đang chờ xử lý theo CourseID.
 */
const findPendingApprovalRequestByCourseId = async (courseId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CourseID', sql.BigInt, courseId);
    request.input('PendingStatus', sql.VarChar, 'PENDING');
    const result = await request.query(`
            SELECT *
            FROM CourseApprovalRequests
            WHERE CourseID = @CourseID AND Status = @PendingStatus
            ORDER BY CreatedAt DESC
        `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(
      `Error finding pending approval for course ${courseId}:`,
      error
    );
    throw error;
  }
};

/**
 * Cập nhật trạng thái yêu cầu phê duyệt.
 */
const updateApprovalRequestStatus = async (
  requestId,
  { status, adminId, adminNotes }
) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('RequestID', sql.BigInt, requestId);
    request.input('Status', sql.VarChar, status);
    request.input('AdminID', sql.BigInt, adminId);
    request.input('AdminNotes', sql.NVarChar, adminNotes);
    request.input('ReviewedAt', sql.DateTime2, new Date());
    request.input('UpdatedAt', sql.DateTime2, new Date());

    const result = await request.query(`
            UPDATE CourseApprovalRequests
            SET Status = @Status,
                AdminID = @AdminID,
                AdminNotes = @AdminNotes,
                ReviewedAt = @ReviewedAt,
                UpdatedAt = @UpdatedAt
            OUTPUT Inserted.*
            WHERE RequestID = @RequestID;
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error(`Error updating approval request ${requestId}:`, error);
    throw error;
  }
};

/**
 * Lấy danh sách các yêu cầu phê duyệt khóa học.
 */
const findCourseApprovalRequests = async (filters = {}, options = {}) => {
  const { status, instructorId, courseId, searchTerm } = filters;
  const { page = 1, limit = 10, sortBy = 'CreatedAt:desc' } = options;
  const offset = (page - 1) * limit;

  try {
    const pool = await getConnection();
    const request = pool.request();

    const whereClauses = [];
    if (status) {
      request.input('Status', sql.VarChar, status);
      whereClauses.push('car.Status = @Status');
    }
    if (instructorId) {
      request.input('InstructorID', sql.BigInt, instructorId);
      whereClauses.push('car.InstructorID = @InstructorID');
    }
    if (courseId) {
      request.input('CourseID', sql.BigInt, courseId);
      whereClauses.push('car.CourseID = @CourseID');
    }
    if (searchTerm) {
      request.input('Search', sql.NVarChar, `%${searchTerm}%`);
      whereClauses.push(`
        (
          c.CourseName LIKE @Search OR
          instructor_up.FullName LIKE @Search OR
          car.InstructorNotes LIKE @Search OR
          car.AdminNotes LIKE @Search
        )
      `);
    }

    const whereCondition =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const commonJoins = `
          FROM CourseApprovalRequests car
          JOIN Courses c ON car.CourseID = c.CourseID
          JOIN UserProfiles instructor_up ON car.InstructorID = instructor_up.AccountID
          LEFT JOIN UserProfiles admin_up ON car.AdminID = admin_up.AccountID
      `;
    const commonQuery = `${commonJoins} ${whereCondition}`;

    const countResult = await request.query(
      `SELECT COUNT(car.RequestID) as total ${commonQuery}`
    );
    const { total } = countResult.recordset[0];

    let orderByClause = 'ORDER BY car.CreatedAt DESC';
    if (sortBy === 'CreatedAt:asc') {
      orderByClause = 'ORDER BY car.CreatedAt ASC';
    } else if (sortBy === 'ReviewedAt:desc') {
      orderByClause = 'ORDER BY car.ReviewedAt DESC, car.CreatedAt DESC';
    } else if (sortBy === 'ReviewedAt:asc') {
      orderByClause = 'ORDER BY car.ReviewedAt ASC, car.CreatedAt ASC';
    }

    request.input('Limit', sql.Int, limit);
    request.input('Offset', sql.Int, offset);
    const dataResult = await request.query(`
          SELECT
              car.RequestID, car.Status, car.RequestType, car.CreatedAt as RequestDate, car.ReviewedAt,
              car.InstructorNotes, car.AdminNotes,
              c.CourseID, c.CourseName, c.Slug as CourseSlug,
              instructor_up.FullName as InstructorName, car.InstructorID,
              admin_up.FullName as AdminName, car.AdminID
          ${commonQuery}
          ${orderByClause}
          OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
      `);

    return { requests: dataResult.recordset, total };
  } catch (error) {
    logger.error('Error finding course approval requests:', error);
    throw error;
  }
};

/**
 * Tìm một yêu cầu phê duyệt cụ thể bằng ID.
 */
const findCourseApprovalRequestById = async (requestId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('RequestID', sql.BigInt, requestId);

    const commonJoins = `
          FROM CourseApprovalRequests car
          JOIN Courses c ON car.CourseID = c.CourseID
          JOIN UserProfiles instructor_up ON car.InstructorID = instructor_up.AccountID
          LEFT JOIN UserProfiles admin_up ON car.AdminID = admin_up.AccountID
      `;
    const result = await request.query(`
         SELECT
          car.*,
          c.CourseName, c.Slug as CourseSlug, c.StatusID as CourseCurrentStatus,
          instructor_up.FullName as InstructorName,
          admin_up.FullName as AdminName
        ${commonJoins}
        WHERE car.RequestID = @RequestID;
      `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(
      `Error finding course approval request by ID ${requestId}:`,
      error
    );
    throw error;
  }
};

/**
 * Tìm khóa học bằng Slug, bao gồm TOÀN BỘ chi tiết curriculum lồng nhau.
 */
const findCourseWithFullDetailsBySlug = async (
  slug,
  includeNonPublished = false
) => {
  logger.debug(
    `Fetching full course details for slug: ${slug}, includeNonPublished: ${includeNonPublished}`
  );
  const pool = await getConnection();
  const request = pool.request();
  request.input('Slug', sql.NVarChar, slug);

  try {
    let courseQuery = `
          SELECT c.*, cat.CategoryName, lvl.LevelName, cs.StatusName,
                 acc.Email as InstructorEmail, up.FullName as InstructorName, up.AvatarUrl as InstructorAvatar
          FROM Courses c
          JOIN Categories cat ON c.CategoryID = cat.CategoryID
          JOIN Levels lvl ON c.LevelID = lvl.LevelID
          JOIN CourseStatuses cs ON c.StatusID = cs.StatusID
          JOIN Accounts acc ON c.InstructorID = acc.AccountID
          JOIN UserProfiles up ON c.InstructorID = up.AccountID
          WHERE c.Slug = @Slug
      `;

    if (!includeNonPublished) {
      request.input('PublishedStatus', sql.VarChar, CourseStatus.PUBLISHED);
      courseQuery += ' AND c.StatusID = @PublishedStatus';
    }

    const courseResult = await request.query(courseQuery);
    const course = courseResult.recordset[0];

    if (!course) {
      logger.warn(`Course with slug "${slug}" not found or not accessible.`);
      return null;
    }

    course.sections = await sectionRepository.findAllSectionsWithDetails(
      course.CourseID
    );
    const durationQuery = `
      SELECT SUM(ISNULL(l.VideoDurationSeconds, 0)) AS TotalDuration
      FROM Lessons l
      JOIN Sections s ON l.SectionID = s.SectionID
      WHERE s.CourseID = @CourseID
    `;
    request.input('CourseID', sql.BigInt, course.CourseID);
    const durationResult = await request.query(durationQuery);
    course.totalDuration = durationResult.recordset[0]?.TotalDuration || 0;

    const lessonCountQuery = `
      SELECT COUNT(*) AS TotalLessons
      FROM Lessons l
      JOIN Sections s ON l.SectionID = s.SectionID
      WHERE s.CourseID = @CourseID
    `;
    const lessonCountResult = await request.query(lessonCountQuery);
    course.totalLessons = lessonCountResult.recordset[0]?.TotalLessons || 0;

    const studentCountQuery = `
      SELECT COUNT(*) AS StudentCount
      FROM Enrollments
      WHERE CourseID = @CourseID
    `;
    const studentCountResult = await request.query(studentCountQuery);
    course.studentCount = studentCountResult.recordset[0]?.StudentCount || 0;

    logger.info(
      `Successfully fetched full details for course ${course.CourseID} (Slug: ${slug})`
    );
    return course;
  } catch (error) {
    logger.error(`Error fetching full course details for slug ${slug}:`, error);
    throw error;
  }
};

/**
 * Tìm khóa học bằng ID, bao gồm TOÀN BỘ chi tiết curriculum lồng nhau.
 */
const findCourseWithFullDetailsById = async (
  courseId,
  includeNonPublished = false
) => {
  logger.debug(
    `Fetching full course details for ID: ${courseId}, includeNonPublished: ${includeNonPublished}`
  );
  const pool = await getConnection();
  const request = pool.request();
  request.input('CourseID', sql.BigInt, courseId);

  try {
    let courseQuery = `
           SELECT c.*, cat.CategoryName, lvl.LevelName, cs.StatusName,
                  acc.Email as InstructorEmail, up.FullName as InstructorName, up.AvatarUrl as InstructorAvatar
           FROM Courses c
           JOIN Categories cat ON c.CategoryID = cat.CategoryID
           JOIN Levels lvl ON c.LevelID = lvl.LevelID
           JOIN CourseStatuses cs ON c.StatusID = cs.StatusID
           JOIN Accounts acc ON c.InstructorID = acc.AccountID
           JOIN UserProfiles up ON c.InstructorID = up.AccountID
           WHERE c.CourseID = @CourseID
       `;
    if (!includeNonPublished) {
      request.input('PublishedStatus', sql.VarChar, CourseStatus.PUBLISHED);
      courseQuery += ' AND c.StatusID = @PublishedStatus';
    }
    const courseResult = await request.query(courseQuery);
    const course = courseResult.recordset[0];
    if (!course) return null;

    course.sections = await sectionRepository.findAllSectionsWithDetails(
      course.CourseID
    );

    logger.info(
      `Successfully fetched full details for course ${course.CourseID}`
    );
    return course;
  } catch (error) {
    logger.error(
      `Error fetching full course details for ID ${courseId}:`,
      error
    );
    throw error;
  }
};

/**
 * Lấy tất cả trạng thái khóa học.
 */
const getAllCourseStatuses = async () => {
  try {
    const pool = await getConnection();
    const request = pool.request();

    const result = await request.query(`
      SELECT StatusID, StatusName, Description
      FROM CourseStatuses
      ORDER BY StatusName ASC
    `);

    return result.recordset;
  } catch (error) {
    logger.error('Error fetching course statuses:', error);
    throw error;
  }
};

module.exports = {
  createCourse,
  findCourseById,
  findCourseBySlug,
  findCourseIdBySlug,
  findAllCourses,
  updateCourseById,
  deleteCourseById,
  createCourseApprovalRequest,
  findPendingApprovalRequestByCourseId,
  updateApprovalRequestStatus,
  findCourseApprovalRequests,
  findCourseApprovalRequestById,
  findCourseWithFullDetailsBySlug,
  findCourseWithFullDetailsById,
  getAllCourseStatuses,
};
