// File: src/api/courses/courses.repository.js

const httpStatus = require('http-status').status;
const ApiError = require('../../core/errors/ApiError');
const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');
const CourseStatus = require('../../core/enums/CourseStatus'); // Sẽ tạo enum này
const sectionRepository = require('../sections/sections.repository'); // Để lấy curriculum
const { toCamelCaseObject } = require('../../utils/caseConverter');
/**
 * Tạo khóa học mới (thường là bản nháp).
 * @param {object} courseData - Dữ liệu khóa học.
 * @param {object} [transaction=null] - Transaction nếu có.
 * @returns {Promise<object>} - Khóa học vừa tạo.
 */
const createCourse = async (courseData, transaction = null) => {
  // Mặc định StatusID là DRAFT nếu không được cung cấp
  const statusId = courseData.StatusID || CourseStatus.DRAFT;

  // Sử dụng pool hoặc transaction
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();

  // Định nghĩa input parameters
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
  // PublishedAt và LiveCourseID thường là NULL khi tạo mới

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
 * @param {number} courseId
 * @param {boolean} includeDraft - Có bao gồm bản nháp không (mặc định là không)
 * @returns {Promise<object|null>}
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

    // Nếu không bao gồm bản nháp, chỉ lấy các trạng thái công khai
    if (!includeDraft) {
      request.input('PublishedStatus', sql.VarChar, CourseStatus.PUBLISHED);
      // Có thể thêm các status khác được coi là public nếu cần (vd: ARCHIVED?)
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
 * @param {string} slug
 * @param {boolean} includeDraft - Có bao gồm bản nháp không (mặc định là không)
 * @returns {Promise<object|null>}
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
 * @param {string} slug
 * @returns {Promise<object|null>} - Chỉ trả về CourseID và Slug nếu tìm thấy.
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
 * @param {object} filters - { categoryId, levelId, instructorId, statusId, isFeatured, searchTerm }
 * @param {object} options - { page, limit, sortBy (vd: 'CreatedAt:desc', 'Price:asc') }
 * @returns {Promise<{ courses: object[], total: number }>}
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
  } = filters; // Mặc định chỉ lấy published
  const { page = 1, limit = 10, sortBy = 'CreatedAt:desc' } = options;
  const offset = (page - 1) * limit;
  console.log('searchTerm', searchTerm);
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
        COUNT(e.EnrollmentID) AS StudentCount -- Đếm số lượng học sinh đã đăng ký
      FROM Courses c
      JOIN Categories cat ON c.CategoryID = cat.CategoryID
      JOIN Levels lvl ON c.LevelID = lvl.LevelID
      JOIN CourseStatuses cs ON c.StatusID = cs.StatusID
      JOIN UserProfiles up ON c.InstructorID = up.AccountID
      LEFT JOIN Enrollments e ON c.CourseID = e.CourseID -- Join với bảng Enrollments để đếm số học sinh
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

    // Áp dụng bộ lọc
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

    // Sắp xếp
    let orderByClause = 'ORDER BY c.CreatedAt DESC'; // Mặc định
    if (sortBy) {
      const [sortField, sortOrder] = sortBy.split(':');
      const allowedSortFields = {
        CreatedAt: 'c.CreatedAt',
        PublishedAt: 'c.PublishedAt',
        Price: 'ISNULL(c.DiscountedPrice, c.OriginalPrice)', // Sắp xếp theo giá thực tế
        Name: 'c.CourseName',
      };
      const orderDirection =
        sortOrder?.toLowerCase() === 'asc' ? 'ASC' : 'DESC'; // Mặc định DESC

      if (allowedSortFields[sortField]) {
        orderByClause = `ORDER BY ${allowedSortFields[sortField]} ${orderDirection}`;
      }
    }
    query += ` ${orderByClause}`;

    // Phân trang
    if (limit > 0) {
      request.input('Limit', sql.Int, limit);
      request.input('Offset', sql.Int, offset);
      query += ' OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY';
    }

    // Query lấy tổng số lượng
    const countResult = await request.query(countQuery);
    const { total } = countResult.recordset[0];

    // Query lấy dữ liệu
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
 * @param {number} courseId
 * @param {object} updateData - Dữ liệu cập nhật.
 * @param {object} [transaction=null] - Transaction nếu có.
 * @returns {Promise<object>} - Khóa học đã cập nhật.
 */
const updateCourseById = async (courseId, updateData, transaction = null) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('CourseID', sql.BigInt, courseId);
  executor.input('UpdatedAt', sql.DateTime2, new Date()); // Luôn cập nhật

  const setClauses = ['UpdatedAt = @UpdatedAt'];

  const keys = Object.keys(updateData);
  keys.forEach((key) => {
    if (key !== 'CourseID' && key !== 'InstructorID' && key !== 'CreatedAt') {
      // Không cho cập nhật PK, InstructorID, CreatedAt
      const value = updateData[key];
      let sqlType;
      // Xác định kiểu dữ liệu (cần mở rộng cho đầy đủ)
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
      else if (['LiveCourseID'].includes(key))
        sqlType = sql.BigInt; // Cần nếu dùng luồng draft/live
      else return; // Bỏ qua key không xác định

      executor.input(key, sqlType, value);
      setClauses.push(`${key} = @${key}`);
    }
  });

  if (setClauses.length === 1) return null; // Không có gì để cập nhật

  const query = `
        UPDATE Courses
        SET ${setClauses.join(', ')}
        OUTPUT Inserted.*
        WHERE CourseID = @CourseID;
    `;

  try {
    const result = await executor.query(query);
    return result.recordset[0]; // Trả về bản ghi đã cập nhật
  } catch (error) {
    logger.error(`Error updating course ${courseId}:`, error);
    throw error;
  }
};

/**
 * Xóa khóa học bằng ID (Cân nhắc xóa mềm).
 * @param {number} courseId
 * @returns {Promise<number>} - Số dòng bị ảnh hưởng.
 */
const deleteCourseById = async (courseId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CourseID', sql.BigInt, courseId);
    // TODO: Xem xét xóa mềm bằng cách cập nhật StatusID thành 'DELETED' hoặc thêm cột IsDeleted
    // Hiện tại đang là xóa cứng
    const result = await request.query(
      'DELETE FROM Courses WHERE CourseID = @CourseID'
    );
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error deleting course ${courseId}:`, error);
    if (error.number === 547) {
      // Lỗi FK (ví dụ: có Enrollment, Section,...)
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Không thể xóa khóa học vì có dữ liệu liên quan (học viên đăng ký, bài học,...). Cân nhắc lưu trữ khóa học thay vì xóa.'
      );
    }
    throw error;
  }
};

// --- Các hàm liên quan đến Course Approval ---
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
    // Status mặc định là PENDING

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

const findPendingApprovalRequestByCourseId = async (courseId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CourseID', sql.BigInt, courseId);
    request.input('PendingStatus', sql.VarChar, 'PENDING'); // Hoặc các trạng thái chờ khác
    const result = await request.query(`
            SELECT *
            FROM CourseApprovalRequests
            WHERE CourseID = @CourseID AND Status = @PendingStatus
            ORDER BY CreatedAt DESC
        `);
    return result.recordset[0] || null; // Lấy request mới nhất
  } catch (error) {
    logger.error(
      `Error finding pending approval for course ${courseId}:`,
      error
    );
    throw error;
  }
};

const updateApprovalRequestStatus = async (
  requestId,
  { status, adminId, adminNotes }
) => {
  try {
    console.log('updateApprovalRequestStatus', requestId);
    console.log('status', status);
    console.log('adminId', adminId);
    console.log('adminNotes', adminNotes);
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
 * Admin: Lấy danh sách các yêu cầu phê duyệt khóa học.
 * @param {object} filters - { status, instructorId, courseId, searchTerm }
 * @param {object} options - { page, limit, sortBy }
 * @returns {Promise<{requests: object[], total: number}>}
 */
const findCourseApprovalRequests = async (filters = {}, options = {}) => {
  const { status, instructorId, courseId, searchTerm } = filters;
  const { page = 1, limit = 10, sortBy = 'CreatedAt:desc' } = options; // Sắp xếp theo yêu cầu mới nhất trước
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
    // Mặc định lấy cả PENDING, APPROVED, REJECTED,... trừ khi có filter status

    const whereCondition =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const commonJoins = `
          FROM CourseApprovalRequests car
          JOIN Courses c ON car.CourseID = c.CourseID
          JOIN UserProfiles instructor_up ON car.InstructorID = instructor_up.AccountID
          LEFT JOIN UserProfiles admin_up ON car.AdminID = admin_up.AccountID -- Admin đã duyệt (nếu có)
      `;
    const commonQuery = `${commonJoins} ${whereCondition}`;

    // Đếm tổng số lượng
    const countResult = await request.query(
      `SELECT COUNT(car.RequestID) as total ${commonQuery}`
    );
    const { total } = countResult.recordset[0];

    // Sắp xếp
    let orderByClause = 'ORDER BY car.CreatedAt DESC'; // Mặc định mới nhất
    if (sortBy === 'CreatedAt:asc') {
      orderByClause = 'ORDER BY car.CreatedAt ASC';
    } else if (sortBy === 'ReviewedAt:desc') {
      orderByClause = 'ORDER BY car.ReviewedAt DESC, car.CreatedAt DESC';
    } else if (sortBy === 'ReviewedAt:asc') {
      orderByClause = 'ORDER BY car.ReviewedAt ASC, car.CreatedAt ASC';
    } // Thêm các tùy chọn sort khác

    // Lấy dữ liệu phân trang
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
 * Admin: Tìm một yêu cầu phê duyệt cụ thể bằng ID.
 * @param {number} requestId
 * @returns {Promise<object|null>}
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
          car.*, -- Lấy tất cả các cột từ request
          c.CourseName, c.Slug as CourseSlug, c.StatusID as CourseCurrentStatus, -- Lấy thêm trạng thái hiện tại của khóa học
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
 * @param {string} slug - Slug của khóa học.
 * @param {boolean} includeNonPublished - True để lấy cả bản nháp/pending/rejected (cho instructor/admin).
 * @returns {Promise<object|null>} - Course object với sections -> lessons -> details...
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
    // 1. Lấy thông tin Course cơ bản và Instructor/Category/Level/Status
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

    // Filter trạng thái nếu không phải lấy bản nháp
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

    // 2. Lấy toàn bộ Curriculum (sections và các con của nó)
    // Sử dụng lại hàm đã tạo cho sync (hoặc tạo hàm tương tự chỉ lấy theo courseId)
    course.sections = await sectionRepository.findAllSectionsWithDetails(
      course.CourseID
    ); // Bỏ transaction vì đây là query độc lập
    // 3. Tính tổng thời gian (duration) của khóa học
    const durationQuery = `
      SELECT SUM(ISNULL(l.VideoDurationSeconds, 0)) AS TotalDuration
      FROM Lessons l
      JOIN Sections s ON l.SectionID = s.SectionID
      WHERE s.CourseID = @CourseID
    `;
    request.input('CourseID', sql.BigInt, course.CourseID);
    const durationResult = await request.query(durationQuery);
    course.totalDuration = durationResult.recordset[0]?.TotalDuration || 0;

    // 4. Đếm tổng số lượng bài học (lessons) trong khóa học
    const lessonCountQuery = `
      SELECT COUNT(*) AS TotalLessons
      FROM Lessons l
      JOIN Sections s ON l.SectionID = s.SectionID
      WHERE s.CourseID = @CourseID
    `;
    const lessonCountResult = await request.query(lessonCountQuery);
    course.totalLessons = lessonCountResult.recordset[0]?.TotalLessons || 0;
    // 5. Đếm số lượng học sinh đã đăng ký khóa học
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
 * (Hàm này cũng hữu ích, có thể dùng thay cho findCourseWithFullDetailsBySlug nếu thích dùng ID)
 * @param {number} courseId
 * @param {boolean} includeNonPublished
 * @returns {Promise<object|null>}
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
    // 1. Lấy thông tin Course cơ bản
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

    // 2. Lấy Curriculum
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

const getAllCourseStatuses = async () => {
  try {
    const pool = await getConnection();
    const request = pool.request();

    const result = await request.query(`
      SELECT StatusID, StatusName, Description
      FROM CourseStatuses
      ORDER BY StatusName ASC
    `);

    return result.recordset; // Trả về danh sách status
  } catch (error) {
    logger.error('Error fetching course statuses:', error);
    throw error;
  }
};

// /**
//  * Admin: Lấy danh sách khóa học đang chờ duyệt (PENDING).
//  * @param {object} options - { page, limit, sortBy }
//  * @returns {Promise<{courses: object[], total: number}>}
//  */
// const findPendingCoursesForAdmin = async (options = {}) => {
//   const { page = 1, limit = 10, sortBy = 'CreatedAt:asc' } = options; // Sắp xếp theo cũ nhất trước?
//   const offset = (page - 1) * limit;

//   try {
//     const pool = await getConnection();
//     const request = pool.request();
//     request.input('PendingStatus', sql.VarChar, CourseStatus.PENDING);

//     const whereCondition = 'WHERE c.StatusID = @PendingStatus';

//     const commonQuery = `
//           FROM Courses c
//           JOIN UserProfiles up ON c.InstructorID = up.AccountID -- Lấy tên instructor
//           ${whereCondition}
//       `;

//     // Đếm tổng số lượng
//     const countResult = await request.query(
//       `SELECT COUNT(c.CourseID) as total ${commonQuery}`
//     );
//     const { total } = countResult.recordset[0];

//     // Sắp xếp
//     let orderByClause = 'ORDER BY c.CreatedAt ASC'; // Ưu tiên duyệt cái cũ trước
//     if (sortBy === 'CreatedAt:desc') {
//       orderByClause = 'ORDER BY c.CreatedAt DESC';
//     } else if (sortBy === 'InstructorName:asc') {
//       orderByClause = 'ORDER BY up.FullName ASC, c.CreatedAt ASC';
//     } // Thêm các tùy chọn sort khác nếu cần

//     // Lấy dữ liệu phân trang
//     request.input('Limit', sql.Int, limit);
//     request.input('Offset', sql.Int, offset);
//     const dataResult = await request.query(`
//           SELECT
//               c.CourseID, c.CourseName, c.Slug, c.UpdatedAt as LastUpdated, c.CreatedAt as SubmittedAt, -- Có thể lấy CreatedAt của Approval Request thay thế?
//               c.InstructorID, up.FullName as InstructorName, up.AvatarUrl as InstructorAvatar
//               -- Lấy thêm RequestID của yêu cầu duyệt tương ứng nếu cần
//            -- (SELECT TOP 1 RequestID FROM CourseApprovalRequests car WHERE car.CourseID = c.CourseID AND car.Status = @PendingStatus ORDER BY car.CreatedAt DESC) as ApprovalRequestID
//           ${commonQuery}
//           ${orderByClause}
//           OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
//       `);

//     return { courses: dataResult.recordset, total };
//   } catch (error) {
//     logger.error('Error finding pending courses for admin:', error);
//     throw error;
//   }
// };

module.exports = {
  createCourse,
  findCourseById,
  findCourseBySlug,
  findCourseIdBySlug,
  findAllCourses,
  updateCourseById,
  deleteCourseById,
  // Approval related
  createCourseApprovalRequest,
  findPendingApprovalRequestByCourseId,
  updateApprovalRequestStatus,
  findCourseApprovalRequests, // *** Thêm export ***
  findCourseApprovalRequestById,
  // Full details
  findCourseWithFullDetailsBySlug,
  findCourseWithFullDetailsById,
  getAllCourseStatuses,
  // findPendingCoursesForAdmin,
};
