// File: src/api/discussions/discussions.repository.js

const httpStatus = require('http-status').status;
const ApiError = require('../../core/errors/ApiError');
const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');

// === Discussion Threads ===

/**
 * Tạo thread mới.
 * @param {object} threadData - { CourseID, LessonID, Title, CreatedByAccountID }
 * @returns {Promise<object>} - Thread vừa tạo.
 */
const createThread = async (threadData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CourseID', sql.BigInt, threadData.CourseID);
    request.input('LessonID', sql.BigInt, threadData.LessonID); // Có thể NULL
    request.input('Title', sql.NVarChar, threadData.Title);
    request.input(
      'CreatedByAccountID',
      sql.BigInt,
      threadData.CreatedByAccountID
    );

    const result = await request.query(`
            INSERT INTO DiscussionThreads (CourseID, LessonID, Title, CreatedByAccountID)
            OUTPUT Inserted.*
            VALUES (@CourseID, @LessonID, @Title, @CreatedByAccountID);
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error creating discussion thread:', error);
    throw error;
  }
};

/**
 * Tìm thread bằng ID.
 * @param {number} threadId
 * @returns {Promise<object|null>} - Thread object kèm thông tin người tạo và khóa học.
 */
const findThreadById = async (threadId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('ThreadID', sql.BigInt, threadId);
    // Join để lấy thông tin cần thiết cho permission check và hiển thị
    const result = await request.query(`
            SELECT
                dt.*,
                up.FullName as CreatorFullName, up.AvatarUrl as CreatorAvatar,
                c.InstructorID as CourseInstructorID, c.StatusID as CourseStatusID
            FROM DiscussionThreads dt
            JOIN Accounts acc ON dt.CreatedByAccountID = acc.AccountID
            JOIN UserProfiles up ON acc.AccountID = up.AccountID
            JOIN Courses c ON dt.CourseID = c.CourseID
            WHERE dt.ThreadID = @ThreadID;
        `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error finding thread by ID ${threadId}:`, error);
    throw error;
  }
};

/**
 * Lấy danh sách threads của course hoặc lesson (phân trang).
 * @param {object} filters - { courseId, lessonId }
 * @param {object} options - { page, limit, sortBy }
 * @returns {Promise<{threads: object[], total: number}>}
 */
const findThreads = async (filters = {}, options = {}) => {
  const { courseId, lessonId } = filters;
  const { page = 1, limit = 10, sortBy = 'UpdatedAt:desc' } = options; // Sắp xếp theo cập nhật mới nhất?
  const offset = (page - 1) * limit;

  try {
    const pool = await getConnection();
    const request = pool.request();
    const whereClauses = [];

    if (courseId) {
      request.input('CourseID', sql.BigInt, courseId);
      whereClauses.push('dt.CourseID = @CourseID');
    }
    if (lessonId) {
      request.input('LessonID', sql.BigInt, lessonId);
      whereClauses.push('dt.LessonID = @LessonID');
    } else {
      // Nếu không filter theo lesson cụ thể, có thể chỉ lấy thread chung của course?
      // whereClauses.push("dt.LessonID IS NULL"); // Bỏ comment nếu muốn
    }

    const whereCondition =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const commonQuery = `
            FROM DiscussionThreads dt
            JOIN UserProfiles up ON dt.CreatedByAccountID = up.AccountID
            LEFT JOIN (
                -- Tìm thời gian post cuối cùng cho mỗi thread để sắp xếp theo UpdatedAt
                SELECT ThreadID, MAX(CreatedAt) as LastPostTime
                FROM DiscussionPosts
                GROUP BY ThreadID
            ) lp ON dt.ThreadID = lp.ThreadID
             ${whereCondition}
        `;

    const countResult = await request.query(
      `SELECT COUNT(dt.ThreadID) as total ${commonQuery}`
    );
    const { total } = countResult.recordset[0];

    // Sắp xếp: Ưu tiên theo thời gian post cuối cùng (lp.LastPostTime), sau đó là thời gian tạo thread
    let orderByClause =
      'ORDER BY ISNULL(lp.LastPostTime, dt.CreatedAt) DESC, dt.CreatedAt DESC';
    if (sortBy === 'CreatedAt:desc') {
      orderByClause = 'ORDER BY dt.CreatedAt DESC';
    } else if (sortBy === 'CreatedAt:asc') {
      orderByClause = 'ORDER BY dt.CreatedAt ASC';
    }
    // Thêm các tùy chọn sort khác nếu cần

    request.input('Limit', sql.Int, limit);
    request.input('Offset', sql.Int, offset);
    const dataResult = await request.query(`
            SELECT
                dt.ThreadID, dt.Title, dt.CourseID, dt.LessonID, dt.CreatedByAccountID, dt.CreatedAt,
                ISNULL(lp.LastPostTime, dt.CreatedAt) as UpdatedAt, -- Coi thời gian post cuối là UpdatedAt
                up.FullName as CreatorFullName, up.AvatarUrl as CreatorAvatar,
                (SELECT COUNT(*) FROM DiscussionPosts WHERE ThreadID = dt.ThreadID) as PostCount -- Đếm số lượng post
            ${commonQuery}
            ${orderByClause}
            OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
        `);

    return { threads: dataResult.recordset, total };
  } catch (error) {
    logger.error('Error finding discussion threads:', error);
    throw error;
  }
};

/**
 * Cập nhật tiêu đề thread.
 * @param {number} threadId
 * @param {string} title
 * @returns {Promise<object>}
 */
const updateThreadTitle = async (threadId, title) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('ThreadID', sql.BigInt, threadId);
    request.input('Title', sql.NVarChar, title);
    request.input('UpdatedAt', sql.DateTime2, new Date()); // Cập nhật UpdatedAt của thread
    const result = await request.query(`
            UPDATE DiscussionThreads SET Title = @Title, UpdatedAt = @UpdatedAt
            OUTPUT Inserted.*
            WHERE ThreadID = @ThreadID;
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error(`Error updating thread title ${threadId}:`, error);
    throw error;
  }
};

/**
 * Xóa thread (và các post liên quan do FK CASCADE).
 * @param {number} threadId
 * @returns {Promise<number>}
 */
const deleteThreadById = async (threadId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('ThreadID', sql.BigInt, threadId);
    const result = await request.query(
      'DELETE FROM DiscussionThreads WHERE ThreadID = @ThreadID'
    );
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error deleting thread ${threadId}:`, error);
    throw error;
  }
};

// === Discussion Posts ===

/**
 * Tạo post mới (reply).
 * @param {object} postData - { ThreadID, ParentPostID, AccountID, PostText, IsInstructorPost }
 * @returns {Promise<object>} - Post vừa tạo.
 */
const createPost = async (postData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('ThreadID', sql.BigInt, postData.ThreadID);
    request.input('ParentPostID', sql.BigInt, postData.ParentPostID); // Có thể NULL
    request.input('AccountID', sql.BigInt, postData.AccountID);
    request.input('PostText', sql.NVarChar, postData.PostText);
    request.input(
      'IsInstructorPost',
      sql.Bit,
      postData.IsInstructorPost || false
    );

    const result = await request.query(`
            INSERT INTO DiscussionPosts (ThreadID, ParentPostID, AccountID, PostText, IsInstructorPost)
            OUTPUT Inserted.*
            VALUES (@ThreadID, @ParentPostID, @AccountID, @PostText, @IsInstructorPost);
        `);
    // Cập nhật UpdatedAt của Thread cha? Có thể làm ở service hoặc trigger
    return result.recordset[0];
  } catch (error) {
    logger.error('Error creating discussion post:', error);
    throw error;
  }
};

/**
 * Tìm post bằng ID.
 * @param {number} postId
 * @returns {Promise<object|null>} - Post object kèm thông tin người tạo.
 */
const findPostById = async (postId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('PostID', sql.BigInt, postId);
    const result = await request.query(`
            SELECT dp.*, up.FullName as AuthorFullName, up.AvatarUrl as AuthorAvatar,
                   dt.CourseID -- Lấy CourseID để check quyền
            FROM DiscussionPosts dp
            JOIN Accounts acc ON dp.AccountID = acc.AccountID
            JOIN UserProfiles up ON acc.AccountID = up.AccountID
            JOIN DiscussionThreads dt ON dp.ThreadID = dt.ThreadID -- Join thread để lấy CourseID
            WHERE dp.PostID = @PostID;
        `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error finding post by ID ${postId}:`, error);
    throw error;
  }
};

/**
 * Lấy danh sách các post của một thread (dạng phẳng, sắp xếp theo thời gian).
 * @param {number} threadId
 * @param {object} options - { page, limit }
 * @returns {Promise<{posts: object[], total: number}>}
 */
const findPostsByThreadId = async (threadId, options = {}) => {
  const { page = 1, limit = 20 } = options; // Lấy nhiều hơn mặc định
  const offset = (page - 1) * limit;

  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('ThreadID', sql.BigInt, threadId);

    const commonQuery = `
            FROM DiscussionPosts dp
            JOIN UserProfiles up ON dp.AccountID = up.AccountID
            WHERE dp.ThreadID = @ThreadID
        `;

    const countResult = await request.query(
      `SELECT COUNT(*) as total ${commonQuery}`
    );
    const { total } = countResult.recordset[0];

    request.input('Limit', sql.Int, limit);
    request.input('Offset', sql.Int, offset);
    const dataResult = await request.query(`
            SELECT
                dp.PostID, dp.ThreadID, dp.ParentPostID, dp.AccountID, dp.PostText,
                dp.IsInstructorPost, dp.CreatedAt, dp.UpdatedAt,
                up.FullName as AuthorFullName, up.AvatarUrl as AuthorAvatar
            ${commonQuery}
            ORDER BY dp.CreatedAt ASC -- Hiển thị theo thứ tự thời gian
            OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
        `);

    return { posts: dataResult.recordset, total };
  } catch (error) {
    logger.error(`Error finding posts for thread ${threadId}:`, error);
    throw error;
  }
};

/**
 * Cập nhật nội dung post.
 * @param {number} postId
 * @param {string} postText
 * @returns {Promise<object>}
 */
const updatePostById = async (postId, postText) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('PostID', sql.BigInt, postId);
    request.input('PostText', sql.NVarChar, postText);
    request.input('UpdatedAt', sql.DateTime2, new Date());
    const result = await request.query(`
            UPDATE DiscussionPosts SET PostText = @PostText, UpdatedAt = @UpdatedAt
            OUTPUT Inserted.*
            WHERE PostID = @PostID;
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error(`Error updating post ${postId}:`, error);
    throw error;
  }
};

/**
 * Xóa post.
 * @param {number} postId
 * @returns {Promise<number>}
 */
const deletePostById = async (postId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('PostID', sql.BigInt, postId);
    // Cân nhắc xóa mềm hoặc chỉ xóa nội dung thay vì xóa cứng?
    const result = await request.query(
      'DELETE FROM DiscussionPosts WHERE PostID = @PostID'
    );
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error deleting post ${postId}:`, error);
    // Kiểm tra FK nếu ParentPostID có ràng buộc NO ACTION
    if (error.number === 547) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Không thể xóa bài viết này vì có bài viết khác trả lời nó.'
      );
    }
    throw error;
  }
};

module.exports = {
  createThread,
  findThreadById,
  findThreads,
  updateThreadTitle,
  deleteThreadById,
  createPost,
  findPostById,
  findPostsByThreadId,
  updatePostById,
  deletePostById,
};
