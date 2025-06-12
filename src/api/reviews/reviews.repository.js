const httpStatus = require('http-status').status;
const ApiError = require('../../core/errors/ApiError');
const { getConnection, sql } = require('../../database/connection');
const { toCamelCaseObject } = require('../../utils/caseConverter');
const logger = require('../../utils/logger');

/**
 * Tạo đánh giá mới.
 * @param {object} reviewData - { CourseID, AccountID, Rating, Comment }
 * @returns {Promise<object>} - Review vừa tạo.
 */
const createReview = async (reviewData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CourseID', sql.BigInt, reviewData.CourseID);
    request.input('AccountID', sql.BigInt, reviewData.AccountID);
    request.input('Rating', sql.TinyInt, reviewData.Rating);
    request.input('Comment', sql.NVarChar, reviewData.Comment);

    const result = await request.query(`
            INSERT INTO CourseReviews (CourseID, AccountID, Rating, Comment)
            OUTPUT Inserted.*
            VALUES (@CourseID, @AccountID, @Rating, @Comment);
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error creating course review:', error);
    if (error.number === 2627 || error.number === 2601) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Bạn đã đánh giá khóa học này rồi.'
      );
    }
    throw error;
  }
};

/**
 * Tìm đánh giá bằng ID.
 * @param {number} reviewId
 * @returns {Promise<object|null>}
 */
const findReviewById = async (reviewId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('ReviewID', sql.BigInt, reviewId);
    const result = await request.query(`
            SELECT r.*, up.FullName as UserFullName, up.AvatarUrl as UserAvatar
            FROM CourseReviews r
            JOIN UserProfiles up ON r.AccountID = up.AccountID
            WHERE r.ReviewID = @ReviewID;
        `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error finding review by ID ${reviewId}:`, error);
    throw error;
  }
};

/**
 * Tìm đánh giá của một user cho một course.
 * @param {number} accountId
 * @param {number} courseId
 * @returns {Promise<object|null>}
 */
const findReviewByUserAndCourse = async (accountId, courseId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, accountId);
    request.input('CourseID', sql.BigInt, courseId);
    const result = await request.query(`
            SELECT r.*, up.FullName as UserFullName, up.AvatarUrl as UserAvatar
            FROM CourseReviews r
            JOIN UserProfiles up ON r.AccountID = up.AccountID
            WHERE r.AccountID = @AccountID AND r.CourseID = @CourseID;
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error(
      `Error finding review by user ${accountId} and course ${courseId}:`,
      error
    );
    throw error;
  }
};

/**
 * Lấy danh sách đánh giá của một khóa học (có phân trang).
 * @param {number} courseId
 * @param {object} options - { page, limit, sortBy ('Rating:desc', 'ReviewedAt:desc'), rating (filter) }
 * @returns {Promise<{reviews: object[], total: number, averageRating: number|null}>}
 */
const findReviewsByCourseId = async (courseId, options = {}) => {
  const { page = 1, limit = 10, sortBy = 'ReviewedAt:desc', rating } = options;
  const offset = (page - 1) * limit;

  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CourseID', sql.BigInt, courseId);

    const whereClauses = ['r.CourseID = @CourseID'];
    if (rating !== undefined && rating >= 1 && rating <= 5) {
      request.input('RatingFilter', sql.TinyInt, rating);
      whereClauses.push('r.Rating = @RatingFilter');
    }
    const whereCondition = `WHERE ${whereClauses.join(' AND ')}`;

    const commonQuery = `
            FROM CourseReviews r
            JOIN UserProfiles up ON r.AccountID = up.AccountID
            ${whereCondition}
        `;

    const summaryResult = await request.query(`
            SELECT COUNT(*) as total, AVG(CAST(Rating AS DECIMAL(3,2))) as averageRating
            ${commonQuery};
        `);
    const { total } = summaryResult.recordset[0];
    const { averageRating } = summaryResult.recordset[0];

    let orderByClause = 'ORDER BY r.ReviewedAt DESC';
    if (sortBy) {
      const [sortField, sortOrder] = sortBy.split(':');
      const allowedSortFields = {
        ReviewedAt: 'r.ReviewedAt',
        Rating: 'r.Rating',
      };
      const orderDirection =
        sortOrder?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      if (allowedSortFields[sortField]) {
        orderByClause = `ORDER BY ${allowedSortFields[sortField]} ${orderDirection}, r.ReviewID ${orderDirection}`;
      }
    }

    request.input('Limit', sql.Int, limit);
    request.input('Offset', sql.Int, offset);
    const dataResult = await request.query(`
            SELECT r.ReviewID, r.Rating, r.Comment, r.ReviewedAt, r.AccountID,
                   up.FullName as UserFullName, up.AvatarUrl as UserAvatar
            ${commonQuery}
            ${orderByClause}
            OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
        `);

    return {
      reviews: dataResult.recordset,
      total,
      averageRating,
    };
  } catch (error) {
    logger.error(`Error finding reviews for course ${courseId}:`, error);
    throw error;
  }
};

/**
 * Cập nhật đánh giá.
 * @param {number} reviewId
 * @param {object} updateData - { Rating, Comment }
 * @returns {Promise<object>} - Review đã cập nhật.
 */
const updateReviewById = async (reviewId, updateData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('ReviewID', sql.BigInt, reviewId);
    logger.info('updateData', updateData);
    const setClauses = [];
    if (updateData.Rating !== undefined) {
      request.input('Rating', sql.TinyInt, updateData.Rating);
      setClauses.push('Rating = @Rating');
    }
    if (updateData.Comment !== undefined) {
      request.input('Comment', sql.NVarChar, updateData.Comment);
      setClauses.push('Comment = @Comment');
    }

    if (setClauses.length === 0) return null;

    const result = await request.query(`
            UPDATE CourseReviews
            SET ${setClauses.join(', ')}
            OUTPUT Inserted.*
            WHERE ReviewID = @ReviewID;
        `);
    const updatedReview = result.recordset[0];
    if (updatedReview) {
      const fullReview = await findReviewById(updatedReview.ReviewID);
      return fullReview;
    }
    return null;
  } catch (error) {
    logger.error(`Error updating review ${reviewId}:`, error);
    throw error;
  }
};

/**
 * Xóa đánh giá.
 * @param {number} reviewId
 * @returns {Promise<number>} - Số dòng bị ảnh hưởng.
 */
const deleteReviewById = async (reviewId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('ReviewID', sql.BigInt, reviewId);
    const result = await request.query(
      'DELETE FROM CourseReviews WHERE ReviewID = @ReviewID'
    );
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error deleting review ${reviewId}:`, error);
    throw error;
  }
};

/**
 * Find reviews based on various filters, including a list of course IDs.
 * @param {object} filterOptions - { courseIds[], minRating, ... }
 * @param {object} paginationOptions - { page, limit, sortBy }
 * @returns {Promise<{ reviews: Array<object>, total: number, page: number, limit: number, totalPages: number }>}
 */
const findReviewsByFilters = async (
  filterOptions = {},
  paginationOptions = {}
) => {
  const { courseIds, minRating, specificCourseId } = filterOptions;
  const {
    page = 1,
    limit = 10,
    sortBy = 'reviewedAt:desc',
  } = paginationOptions;
  const offset = (page - 1) * limit;

  try {
    const pool = await getConnection();
    const request = pool.request();

    const whereClauses = [];

    if (courseIds && courseIds.length > 0) {
      const courseIdParams = courseIds.map((id, index) => `@courseId_${index}`);
      courseIds.forEach((id, index) =>
        request.input(`courseId_${index}`, sql.Int, id)
      );
      whereClauses.push(`cr.CourseID IN (${courseIdParams.join(',')})`);
    } else {
      return { reviews: [], total: 0, page, limit, totalPages: 0 };
    }

    if (typeof minRating === 'number') {
      request.input('MinRating', sql.Int, minRating);
      whereClauses.push('cr.Rating >= @MinRating');
    }

    const whereCondition =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(cr.ReviewID) as total
      FROM CourseReviews cr
      ${whereCondition};
    `;
    const countResult = await request.query(countQuery);
    const total = countResult.recordset[0] ? countResult.recordset[0].total : 0;

    if (total === 0) {
      return { reviews: [], total: 0, page, limit, totalPages: 0 };
    }

    let orderByClause = 'ORDER BY cr.CreatedAt DESC';
    if (sortBy) {
      const [field, order] = sortBy.split(':');
      const sortOrder = order?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      switch (field) {
        case 'reviewedAt':
          orderByClause = `ORDER BY cr.CreatedAt ${sortOrder}`;
          break;
        case 'rating':
          orderByClause = `ORDER BY cr.Rating ${sortOrder}, cr.CreatedAt DESC`;
          break;
        default:
          orderByClause = `ORDER BY cr.CreatedAt DESC`;
          break;
      }
    }

    const dataQuery = `
      SELECT
        cr.ReviewID,
        cr.CourseID,
        c.CourseName,
        cr.Rating,
        cr.Comment,
        cr.AccountID,
        up.FullName as UserFullName,
        up.AvatarUrl as UserAvatarUrl,
        cr.CreatedAt,
        cr.UpdatedAt
      FROM CourseReviews cr
      JOIN Courses c ON cr.CourseID = c.CourseID
      JOIN UserProfiles up ON cr.AccountID = up.AccountID 
      ${whereCondition}
      ${orderByClause}
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
    `;
    request.input('Offset', sql.Int, offset);
    request.input('Limit', sql.Int, limit);

    const dataResult = await request.query(dataQuery);

    const reviews = dataResult.recordset.map((review) => ({
      reviewId: review.ReviewID,
      courseId: review.CourseID,
      courseName: review.CourseName,
      rating: review.Rating,
      comment: review.Comment,
      accountId: review.AccountID,
      userFullName: review.UserFullName,
      userAvatarUrl: review.UserAvatarUrl,
      createdAt: review.CreatedAt,
      updatedAt: review.UpdatedAt,
    }));

    return {
      reviews,
      total,
      page,
      limit,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 1,
    };
  } catch (error) {
    logger.error('Error in findReviewsByFilters repository:', error);
    throw error;
  }
};

module.exports = {
  createReview,
  findReviewById,
  findReviewByUserAndCourse,
  findReviewsByCourseId,
  updateReviewById,
  deleteReviewById,
  findReviewsByFilters,
};
