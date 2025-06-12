// File: src/api/categories/categories.repository.js

const httpStatus = require('http-status').status;
const ApiError = require('../../core/errors/ApiError');
const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');
/**
 * Tạo danh mục mới
 */
const createCategory = async ({ categoryName, slug, description, iconUrl }) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CategoryName', sql.NVarChar, categoryName);
    request.input('Slug', sql.VarChar, slug);
    request.input('Description', sql.NVarChar, description);
    request.input('IconUrl', sql.VarChar, iconUrl);

    const result = await request.query(`
            INSERT INTO Categories (CategoryName, Slug, Description, IconUrl)
            OUTPUT Inserted.*
            VALUES (@CategoryName, @Slug, @Description, @IconUrl);
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error in createCategory repository:', error);
    throw error;
  }
};

/**
 * Tìm danh mục theo ID
 */
const findCategoryById = async (categoryId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CategoryID', sql.Int, categoryId);
    const result = await request.query(
      'SELECT * FROM Categories WHERE CategoryID = @CategoryID'
    );
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error in findCategoryById (${categoryId}):`, error);
    throw error;
  }
};

/**
 * Tìm danh mục theo slug
 */
const findCategoryBySlug = async (slug) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('Slug', sql.VarChar, slug);
    const result = await request.query(
      'SELECT * FROM Categories WHERE Slug = @Slug'
    );
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error in findCategoryBySlug (${slug}):`, error);
    throw error;
  }
};

/**
 * Tìm danh mục theo tên
 */
const findCategoryByName = async (categoryName) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CategoryName', sql.NVarChar, categoryName);
    const result = await request.query(
      'SELECT * FROM Categories WHERE CategoryName = @CategoryName'
    );
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error in findCategoryByName (${categoryName}):`, error);
    throw error;
  }
};

/**
 * Lấy tất cả danh mục (có phân trang và tìm kiếm)
 */
const findAllCategories = async ({ page = 1, limit = 0, searchTerm = '' }) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    let query = `
      SELECT
        c.CategoryID,
        c.CategoryName,
        c.Slug,
        c.Description,
        c.IconUrl,
        c.CreatedAt,
        c.UpdatedAt,
        ISNULL(course_counts.CourseCount, 0) AS CourseCount
      FROM Categories c
      LEFT JOIN (
        SELECT CategoryID, COUNT(CourseID) AS CourseCount
        FROM Courses
        GROUP BY CategoryID
      ) AS course_counts ON c.CategoryID = course_counts.CategoryID
    `;
    let countQuery = 'SELECT COUNT(*) as total FROM Categories';
    const whereClauses = [];

    if (searchTerm) {
      request.input('Search', sql.NVarChar, `%${searchTerm}%`);
      whereClauses.push('(CategoryName LIKE @Search OR Slug LIKE @Search)');
    }

    if (whereClauses.length > 0) {
      const whereCondition = ` WHERE ${whereClauses.join(' AND ')}`;
      query += whereCondition;
      countQuery += whereCondition;
    }

    query += ' ORDER BY CategoryName ASC';

    let total = 0;
    if (limit > 0) {
      const countResult = await request.query(countQuery);
      total = countResult.recordset[0].total;
      const offset = (page - 1) * limit;
      request.input('Limit', sql.Int, limit);
      request.input('Offset', sql.Int, offset);
      query += ' OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY';
    }

    const result = await request.query(query);
    return { categories: result.recordset, total };
  } catch (error) {
    logger.error('Error in findAllCategories repository:', error);
    throw error;
  }
};

/**
 * Cập nhật danh mục theo ID
 */
const updateCategoryById = async (categoryId, updateData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CategoryID', sql.Int, categoryId);
    request.input('UpdatedAt', sql.DateTime2, new Date());

    const setClauses = ['UpdatedAt = @UpdatedAt'];
    Object.entries(updateData).forEach(([key, value]) => {
      let sqlType;
      if (key === 'CategoryName' || key === 'Description') {
        sqlType = sql.NVarChar;
      } else if (key === 'Slug' || key === 'IconUrl') {
        sqlType = sql.VarChar;
      } else {
        return;
      }

      request.input(key, sqlType, value);
      setClauses.push(`${key} = @${key}`);
    });

    if (setClauses.length === 1) return 0;

    const query = `
            UPDATE Categories
            SET ${setClauses.join(', ')}
            OUTPUT Inserted.*
            WHERE CategoryID = @CategoryID;
        `;
    const result = await request.query(query);
    return result.recordset[0];
  } catch (error) {
    logger.error(`Error updating category ${categoryId}:`, error);
    throw error;
  }
};

/**
 * Đếm số khóa học trong danh mục
 */
const countCoursesInCategory = async (categoryId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CategoryID', sql.Int, categoryId);
    const result = await request.query(
      'SELECT COUNT(CourseID) as courseCount FROM Courses WHERE CategoryID = @CategoryID'
    );
    return result.recordset[0].courseCount;
  } catch (error) {
    logger.error(`Error counting courses in category ${categoryId}:`, error);
    throw error;
  }
};

/**
 * Xóa danh mục theo ID
 */
const deleteCategoryById = async (categoryId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CategoryID', sql.Int, categoryId);
    const result = await request.query(
      'DELETE FROM Categories WHERE CategoryID = @CategoryID'
    );
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error deleting category ${categoryId}:`, error);
    if (error.number === 547) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Không thể xóa danh mục vì đang có khóa học sử dụng.'
      );
    }
    throw error;
  }
};

module.exports = {
  createCategory,
  findCategoryById,
  findCategoryBySlug,
  findCategoryByName,
  findAllCategories,
  updateCategoryById,
  countCoursesInCategory,
  deleteCategoryById,
};
