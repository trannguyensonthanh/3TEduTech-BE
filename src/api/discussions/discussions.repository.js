// File: src/api/discussions/discussions.repository.js

const httpStatus = require('http-status').status;
const ApiError = require('../../core/errors/ApiError');
const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');

/**
 * Tạo một chủ đề thảo luận (thread) mới trong cơ sở dữ liệu.
 * @param {object} threadData - Dữ liệu của thread, bao gồm { CourseID, LessonID, Title, CreatedByAccountID }.
 * @returns {Promise<object>} - Trả về đối tượng thread vừa được tạo.
 */
const createThread = async (threadData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CourseID', sql.BigInt, threadData.CourseID);
    request.input('LessonID', sql.BigInt, threadData.LessonID);
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
 * Tìm một thread bằng ID, kèm theo thông tin người tạo và khóa học.
 * @param {number} threadId - ID của thread cần tìm.
 * @returns {Promise<object|null>} - Trả về đối tượng thread hoặc null nếu không tìm thấy.
 */
const findThreadById = async (threadId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('ThreadID', sql.BigInt, threadId);

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
 * Lấy danh sách các thread theo khóa học hoặc bài học, có hỗ trợ phân trang và sắp xếp.
 * @param {object} filters - Bộ lọc, bao gồm { courseId, lessonId }.
 * @param {object} options - Tùy chọn phân trang và sắp xếp, bao gồm { page, limit, sortBy }.
 * @returns {Promise<{threads: object[], total: number}>} - Trả về danh sách thread và tổng số lượng.
 */
const findThreads = async (filters = {}, options = {}) => {
  const { courseId, lessonId } = filters;
  const { page = 1, limit = 10, sortBy = 'UpdatedAt:desc' } = options;
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
      whereClauses.push('dt.LessonID IS NULL');
    }

    const whereCondition =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const commonQuery = `
            FROM DiscussionThreads dt
            JOIN UserProfiles up ON dt.CreatedByAccountID = up.AccountID
            LEFT JOIN (
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

    let orderByClause =
      'ORDER BY ISNULL(lp.LastPostTime, dt.CreatedAt) DESC, dt.CreatedAt DESC';
    if (sortBy === 'CreatedAt:desc') {
      orderByClause = 'ORDER BY dt.CreatedAt DESC';
    } else if (sortBy === 'CreatedAt:asc') {
      orderByClause = 'ORDER BY dt.CreatedAt ASC';
    }

    request.input('Limit', sql.Int, limit);
    request.input('Offset', sql.Int, offset);
    const dataResult = await request.query(`
            SELECT
                dt.ThreadID, dt.Title, dt.CourseID, dt.LessonID, dt.CreatedByAccountID, dt.CreatedAt,
                ISNULL(lp.LastPostTime, dt.CreatedAt) as UpdatedAt,
                up.FullName as CreatorFullName, up.AvatarUrl as CreatorAvatar,
                (SELECT COUNT(*) FROM DiscussionPosts WHERE ThreadID = dt.ThreadID) as PostCount
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
 * Cập nhật tiêu đề của một thread.
 * @param {number} threadId - ID của thread cần cập nhật.
 * @param {string} title - Tiêu đề mới.
 * @returns {Promise<object>} - Trả về đối tượng thread đã được cập nhật.
 */
const updateThreadTitle = async (threadId, title) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('ThreadID', sql.BigInt, threadId);
    request.input('Title', sql.NVarChar, title);
    request.input('UpdatedAt', sql.DateTime2, new Date());
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
 * Xóa một thread khỏi cơ sở dữ liệu bằng ID.
 * @param {number} threadId - ID của thread cần xóa.
 * @returns {Promise<number>} - Trả về số dòng bị ảnh hưởng (thường là 1 hoặc 0).
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

/**
 * Tạo một bài viết (post) mới trong một thread.
 * @param {object} postData - Dữ liệu của bài viết, bao gồm { ThreadID, ParentPostID, AccountID, PostText, IsInstructorPost }.
 * @returns {Promise<object>} - Trả về đối tượng post vừa được tạo.
 */
const createPost = async (postData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('ThreadID', sql.BigInt, postData.ThreadID);
    request.input('ParentPostID', sql.BigInt, postData.ParentPostID);
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

    return result.recordset[0];
  } catch (error) {
    logger.error('Error creating discussion post:', error);
    throw error;
  }
};

/**
 * Tìm một bài viết (post) bằng ID, kèm theo thông tin người tạo.
 * @param {number} postId - ID của bài viết cần tìm.
 * @returns {Promise<object|null>} - Trả về đối tượng post hoặc null nếu không tìm thấy.
 */
const findPostById = async (postId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('PostID', sql.BigInt, postId);
    const result = await request.query(`
            SELECT dp.*, up.FullName as AuthorFullName, up.AvatarUrl as AuthorAvatar,
                   dt.CourseID
            FROM DiscussionPosts dp
            JOIN Accounts acc ON dp.AccountID = acc.AccountID
            JOIN UserProfiles up ON acc.AccountID = up.AccountID
            JOIN DiscussionThreads dt ON dp.ThreadID = dt.ThreadID
            WHERE dp.PostID = @PostID;
        `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error finding post by ID ${postId}:`, error);
    throw error;
  }
};

/**
 * Lấy danh sách các bài viết (post) của một thread, có hỗ trợ phân trang.
 * @param {number} threadId - ID của thread chứa các bài viết.
 * @param {object} options - Tùy chọn phân trang, bao gồm { page, limit }.
 * @returns {Promise<{posts: object[], total: number}>} - Trả về danh sách post và tổng số lượng.
 */
const findPostsByThreadId = async (threadId, options = {}) => {
  const { page = 1, limit = 20 } = options;
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
            ORDER BY dp.CreatedAt ASC
            OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
        `);

    return { posts: dataResult.recordset, total };
  } catch (error) {
    logger.error(`Error finding posts for thread ${threadId}:`, error);
    throw error;
  }
};

/**
 * Cập nhật nội dung của một bài viết (post).
 * @param {number} postId - ID của bài viết cần cập nhật.
 * @param {string} postText - Nội dung mới của bài viết.
 * @returns {Promise<object>} - Trả về đối tượng post đã được cập nhật.
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
 * Xóa một bài viết (post) khỏi cơ sở dữ liệu bằng ID.
 * @param {number} postId - ID của bài viết cần xóa.
 * @returns {Promise<number>} - Trả về số dòng bị ảnh hưởng.
 */
const deletePostById = async (postId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('PostID', sql.BigInt, postId);

    const result = await request.query(
      'DELETE FROM DiscussionPosts WHERE PostID = @PostID'
    );
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error deleting post ${postId}:`, error);

    if (error.number === 547) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Không thể xóa bài viết này vì có bài viết khác trả lời nó.'
      );
    }
    throw error;
  }
};

/**
 * Cập nhật trạng thái đóng/mở (IsClosed) của một thread.
 * @param {number} threadId - ID của thread cần cập nhật.
 * @param {boolean} isClosed - Trạng thái mới (true là đóng, false là mở).
 * @returns {Promise<object|null>} - Trả về đối tượng thread đã được cập nhật hoặc null nếu không tìm thấy.
 */
const updateThreadClosedStatus = async (threadId, isClosed) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('ThreadID', sql.BigInt, threadId);
    request.input('IsClosed', sql.Bit, isClosed);
    request.input('UpdatedAt', sql.DateTime2, new Date());
    const result = await request.query(`
            UPDATE DiscussionThreads
            SET IsClosed = @IsClosed, UpdatedAt = @UpdatedAt
            OUTPUT Inserted.*
            WHERE ThreadID = @ThreadID;
        `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(
      `Error updating IsClosed status for thread ${threadId}:`,
      error
    );
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
  updateThreadClosedStatus,
};
