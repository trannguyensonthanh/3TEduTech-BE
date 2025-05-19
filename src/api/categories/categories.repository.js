// File: src/api/categories/categories.repository.js

const httpStatus = require('http-status').status;
const ApiError = require('../../core/errors/ApiError');
const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');

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

const findAllCategories = async ({ page = 1, limit = 0, searchTerm = '' }) => {
  // limit = 0 để lấy tất cả
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
    // Chỉ thực hiện count nếu có phân trang (limit > 0)
    if (limit > 0) {
      const countResult = await request.query(countQuery);
      total = countResult.recordset[0].total;
      const offset = (page - 1) * limit;
      request.input('Limit', sql.Int, limit);
      request.input('Offset', sql.Int, offset);
      query += ' OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY';
    }

    const result = await request.query(query);
    return { categories: result.recordset, total }; // Trả về total = 0 nếu không phân trang
  } catch (error) {
    logger.error('Error in findAllCategories repository:', error);
    throw error;
  }
};

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
        return; // Bỏ qua các key không hợp lệ
      }

      request.input(key, sqlType, value);
      setClauses.push(`${key} = @${key}`);
    });

    if (setClauses.length === 1) return 0; // Không có gì để cập nhật

    const query = `
            UPDATE Categories
            SET ${setClauses.join(', ')}
            OUTPUT Inserted.*
            WHERE CategoryID = @CategoryID;
        `;
    const result = await request.query(query);
    return result.recordset[0]; // Trả về bản ghi đã cập nhật
  } catch (error) {
    logger.error(`Error updating category ${categoryId}:`, error);
    throw error;
  }
};

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

const deleteCategoryById = async (categoryId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CategoryID', sql.Int, categoryId);
    // ON DELETE NO ACTION sẽ gây lỗi nếu có khóa học tham chiếu, nên không cần query phức tạp
    const result = await request.query(
      'DELETE FROM Categories WHERE CategoryID = @CategoryID'
    );
    return result.rowsAffected[0]; // Số dòng bị xóa
  } catch (error) {
    logger.error(`Error deleting category ${categoryId}:`, error);
    // Bắt lỗi FK cụ thể
    if (error.number === 547) {
      // Lỗi Foreign Key constraint
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Không thể xóa danh mục vì đang có khóa học sử dụng.'
      );
    }
    throw error; // Ném lại các lỗi khác
  }
};

module.exports = {
  createCategory,
  findCategoryById,
  findCategoryBySlug,
  findCategoryByName,
  findAllCategories,
  updateCategoryById,
  countCoursesInCategory, // Giữ lại để service kiểm tra trước
  deleteCategoryById,
};
