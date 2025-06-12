const httpStatus = require('http-status').status;
const ApiError = require('../../core/errors/ApiError');
const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');

/**
 * Tạo skill mới
 */
const createSkill = async ({ skillName, description }) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('SkillName', sql.NVarChar, skillName);
    request.input('Description', sql.NVarChar, description);
    const result = await request.query(`
            INSERT INTO Skills (SkillName, Description)
            OUTPUT Inserted.*
            VALUES (@SkillName, @Description);
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error creating skill:', error);
    if (error.number === 2627 || error.number === 2601) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Tên kỹ năng đã tồn tại.');
    }
    throw error;
  }
};

/**
 * Tìm skill theo ID
 */
const findSkillById = async (skillId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('SkillID', sql.Int, skillId);
    const result = await request.query(
      'SELECT * FROM Skills WHERE SkillID = @SkillID;'
    );
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error finding skill by ID ${skillId}:`, error);
    throw error;
  }
};

/**
 * Tìm skill theo tên
 */
const findSkillByName = async (skillName) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('SkillName', sql.NVarChar, skillName);
    const result = await request.query(
      'SELECT * FROM Skills WHERE SkillName = @SkillName;'
    );
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error finding skill by name ${skillName}:`, error);
    throw error;
  }
};

/**
 * Tìm kiếm/lấy tất cả skills (có thể phân trang nếu nhiều)
 */
const findAllSkills = async ({ searchTerm = '', page = 1, limit = 0 }) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    let query =
      'SELECT SkillID, SkillName, Description, CreatedAt, UpdatedAt FROM Skills';
    let countQuery = 'SELECT COUNT(*) as total FROM Skills';
    const whereClauses = [];

    if (searchTerm) {
      request.input('Search', sql.NVarChar, `%${searchTerm}%`);
      whereClauses.push('(SkillName LIKE @Search OR Description LIKE @Search)');
    }
    const whereCondition =
      whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';
    query += whereCondition;
    countQuery += whereCondition;

    query += ' ORDER BY SkillName ASC';

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
    return { skills: result.recordset, total };
  } catch (error) {
    logger.error('Error finding all skills:', error);
    throw error;
  }
};

/**
 * Cập nhật skill theo ID
 */
const updateSkillById = async (skillId, { skillName, description }) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('SkillID', sql.Int, skillId);
    request.input('UpdatedAt', sql.DateTime2, new Date());

    const setClauses = ['UpdatedAt = @UpdatedAt'];
    if (skillName !== undefined) {
      request.input('SkillName', sql.NVarChar, skillName);
      setClauses.push('SkillName = @SkillName');
    }
    if (description !== undefined) {
      request.input('Description', sql.NVarChar, description);
      setClauses.push('Description = @Description');
    }

    if (setClauses.length === 1) return null;

    const result = await request.query(`
            UPDATE Skills SET ${setClauses.join(', ')}
            OUTPUT Inserted.*
            WHERE SkillID = @SkillID;
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error(`Error updating skill ${skillId}:`, error);
    if (error.number === 2627 || error.number === 2601) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Tên kỹ năng đã tồn tại.');
    }
    throw error;
  }
};

/**
 * Đếm số instructor có skill này
 */
const countInstructorsWithSkill = async (skillId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('SkillID', sql.Int, skillId);
    const result = await request.query(
      'SELECT COUNT(*) as instructorCount FROM InstructorSkills WHERE SkillID = @SkillID'
    );
    return result.recordset[0].instructorCount;
  } catch (error) {
    logger.error(`Error counting instructors for skill ${skillId}:`, error);
    throw error;
  }
};

/**
 * Xóa skill theo ID
 */
const deleteSkillById = async (skillId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('SkillID', sql.Int, skillId);
    const result = await request.query(
      'DELETE FROM Skills WHERE SkillID = @SkillID'
    );
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error deleting skill ${skillId}:`, error);
    if (error.number === 547) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Không thể xóa kỹ năng vì đang có giảng viên sử dụng.'
      );
    }
    throw error;
  }
};

/**
 * Tìm Skill bằng tên, nếu không thấy thì tạo mới (trong transaction).
 * @param {string} skillName
 * @param {object} transaction
 * @returns {Promise<object>} - Skill object (tìm thấy hoặc vừa tạo).
 */
const findOrCreateSkill = async (skillName, transaction) => {
  console.log('Finding or creating skill:', skillName);
  const findRequest = transaction.request();
  findRequest.input('SkillName', sql.NVarChar, skillName);
  let result = await findRequest.query(
    'SELECT * FROM Skills WHERE SkillName = @SkillName;'
  );
  let skill = result.recordset[0];

  if (skill) {
    return skill;
  }

  logger.info(`Skill "${skillName}" not found, creating new one.`);
  const createRequest = transaction.request();
  createRequest.input('SkillName', sql.NVarChar, skillName);
  createRequest.input('Description', sql.NVarChar, null);
  result = await createRequest.query(`
    INSERT INTO Skills (SkillName, Description)
    OUTPUT Inserted.*
    VALUES (@SkillName, @Description);
  `);
  [skill] = result.recordset;
  if (!skill) {
    throw new Error(`Failed to create or find skill: ${skillName}`);
  }
  return skill;
};

module.exports = {
  createSkill,
  findSkillById,
  findSkillByName,
  findAllSkills,
  updateSkillById,
  countInstructorsWithSkill,
  deleteSkillById,
  findOrCreateSkill,
};
