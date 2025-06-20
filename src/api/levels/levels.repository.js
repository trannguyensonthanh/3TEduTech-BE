const httpStatus = require('http-status').status;
const ApiError = require('../../core/errors/ApiError');
const { getConnection, sql } = require('../../database/connection');
const { toCamelCaseObject } = require('../../utils/caseConverter');
const logger = require('../../utils/logger');

/**
 * Create a new level
 */
const createLevel = async ({ levelName }) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('LevelName', sql.NVarChar, levelName);
    const result = await request.query(`
            INSERT INTO Levels (LevelName)
            OUTPUT Inserted.*
            VALUES (@LevelName);
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error in createLevel repository:', error);
    throw error;
  }
};

/**
 * Find a level by its ID
 */
const findLevelById = async (levelId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('LevelID', sql.Int, levelId);
    const result = await request.query(
      'SELECT * FROM Levels WHERE LevelID = @LevelID'
    );
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error in findLevelById (${levelId}):`, error);
    throw error;
  }
};

/**
 * Find a level by its name
 */
const findLevelByName = async (levelName) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('LevelName', sql.NVarChar, levelName);
    const result = await request.query(
      'SELECT * FROM Levels WHERE LevelName = @LevelName'
    );
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error in findLevelByName (${levelName}):`, error);
    throw error;
  }
};

/**
 * Find all levels
 */
const findAllLevels = async () => {
  try {
    const pool = await getConnection();
    const result = await pool
      .request()
      .query('SELECT * FROM Levels ORDER BY LevelID ASC');
    return result.recordset;
  } catch (error) {
    logger.error('Error in findAllLevels repository:', error);
    throw error;
  }
};

/**
 * Update a level by its ID
 */
const updateLevelById = async (levelId, { levelName }) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('LevelID', sql.Int, levelId);
    request.input('LevelName', sql.NVarChar, levelName);
    request.input('UpdatedAt', sql.DateTime2, new Date());
    const result = await request.query(`
            UPDATE Levels
            SET LevelName = @LevelName, UpdatedAt = @UpdatedAt
            OUTPUT Inserted.*
            WHERE LevelID = @LevelID;
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error(`Error updating level ${levelId}:`, error);
    throw error;
  }
};

/**
 * Count courses in a level
 */
const countCoursesInLevel = async (levelId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('LevelID', sql.Int, levelId);
    const result = await request.query(
      'SELECT COUNT(CourseID) as courseCount FROM Courses WHERE LevelID = @LevelID'
    );
    return result.recordset[0].courseCount;
  } catch (error) {
    logger.error(`Error counting courses in level ${levelId}:`, error);
    throw error;
  }
};

/**
 * Delete a level by its ID
 */
const deleteLevelById = async (levelId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('LevelID', sql.Int, levelId);
    const result = await request.query(
      'DELETE FROM Levels WHERE LevelID = @LevelID'
    );
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error deleting level ${levelId}:`, error);
    if (error.number === 547) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Không thể xóa cấp độ vì đang có khóa học sử dụng.'
      );
    }
    throw error;
  }
};

module.exports = {
  createLevel,
  findLevelById,
  findLevelByName,
  findAllLevels,
  updateLevelById,
  countCoursesInLevel,
  deleteLevelById,
};
