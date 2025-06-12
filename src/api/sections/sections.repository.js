const httpStatus = require('http-status').status;
const ApiError = require('../../core/errors/ApiError');
const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');
const lessonRepository = require('../lessons/lessons.repository');

/**
 * Lấy thứ tự section lớn nhất hiện tại của một khóa học.
 * @param {number} courseId
 * @param {object} [transaction=null] - Transaction nếu có.
 * @returns {Promise<number>} - Thứ tự lớn nhất, hoặc -1 nếu chưa có section nào.
 */
const getMaxSectionOrder = async (courseId, transaction = null) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('CourseID', sql.BigInt, courseId);
  try {
    const result = await executor.query(
      'SELECT MAX(SectionOrder) as maxOrder FROM Sections WHERE CourseID = @CourseID'
    );
    return result.recordset[0].maxOrder === null
      ? -1
      : result.recordset[0].maxOrder;
  } catch (error) {
    logger.error(
      `Error getting max section order for course ${courseId}:`,
      error
    );
    throw error;
  }
};

/**
 * Tạo section mới.
 * @param {object} sectionData - { CourseID, SectionName, SectionOrder, Description }
 * @param {object} [transaction=null] - Transaction nếu có.
 * @returns {Promise<object>} - Section vừa tạo.
 */
const createSection = async (sectionData, transaction = null) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('CourseID', sql.BigInt, sectionData.CourseID);
  executor.input('SectionName', sql.NVarChar, sectionData.SectionName);
  executor.input('SectionOrder', sql.Int, sectionData.SectionOrder);
  executor.input('Description', sql.NVarChar, sectionData.Description);

  try {
    const result = await executor.query(`
            INSERT INTO Sections (CourseID, SectionName, SectionOrder, Description)
            OUTPUT Inserted.*
            VALUES (@CourseID, @SectionName, @SectionOrder, @Description);
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error in createSection repository:', error);
    throw error;
  }
};

/**
 * Tìm section bằng ID.
 * @param {number} sectionId
 * @returns {Promise<object|null>}
 */
const findSectionById = async (sectionId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('SectionID', sql.BigInt, sectionId);
    const result = await request.query(`
            SELECT s.*, c.InstructorID, c.StatusID as CourseStatusID
            FROM Sections s
            JOIN Courses c ON s.CourseID = c.CourseID
            WHERE s.SectionID = @SectionID
        `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error in findSectionById (${sectionId}):`, error);
    throw error;
  }
};

/**
 * Lấy tất cả sections của một khóa học (theo thứ tự).
 * @param {number} courseId
 * @returns {Promise<object[]>} - Mảng các section.
 */
const findSectionsByCourseId = async (courseId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CourseID', sql.BigInt, courseId);
    const result = await request.query(`
            SELECT *
            FROM Sections
            WHERE CourseID = @CourseID
            ORDER BY SectionOrder ASC;
        `);
    return result.recordset;
  } catch (error) {
    logger.error(`Error finding sections for course ${courseId}:`, error);
    throw error;
  }
};

/**
 * Cập nhật section bằng ID.
 * @param {number} sectionId
 * @param {object} updateData - Dữ liệu cập nhật (SectionName, Description, SectionOrder).
 * @param {object} [transaction=null] - Transaction nếu có.
 * @returns {Promise<object>} - Section đã cập nhật.
 */
const updateSectionById = async (sectionId, updateData, transaction = null) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('SectionID', sql.BigInt, sectionId);
  executor.input('UpdatedAt', sql.DateTime2, new Date());

  const setClauses = ['UpdatedAt = @UpdatedAt'];
  if (updateData.SectionName !== undefined) {
    executor.input('SectionName', sql.NVarChar, updateData.SectionName);
    setClauses.push('SectionName = @SectionName');
  }
  if (updateData.Description !== undefined) {
    executor.input('Description', sql.NVarChar, updateData.Description);
    setClauses.push('Description = @Description');
  }
  if (updateData.SectionOrder !== undefined) {
    executor.input('SectionOrder', sql.Int, updateData.SectionOrder);
    setClauses.push('SectionOrder = @SectionOrder');
  }

  if (setClauses.length === 1) return null;

  const query = `
        UPDATE Sections
        SET ${setClauses.join(', ')}
        OUTPUT Inserted.*
        WHERE SectionID = @SectionID;
    `;

  try {
    const result = await executor.query(query);
    return result.recordset[0];
  } catch (error) {
    logger.error(`Error updating section ${sectionId}:`, error);
    throw error;
  }
};

/**
 * Xóa section bằng ID.
 * @param {number} sectionId
 * @returns {Promise<number>} - Số dòng bị ảnh hưởng.
 */
const deleteSectionById = async (sectionId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('SectionID', sql.BigInt, sectionId);
    const result = await request.query(
      'DELETE FROM Sections WHERE SectionID = @SectionID'
    );
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error deleting section ${sectionId}:`, error);
    if (error.number === 547) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Không thể xóa chương này do có ràng buộc dữ liệu khác.'
      );
    }
    throw error;
  }
};

/**
 * Cập nhật thứ tự cho nhiều section cùng lúc (trong transaction).
 * @param {Array<{id: number, order: number}>} sectionOrders - Mảng các section và thứ tự mới.
 * @param {object} transaction - Transaction object.
 * @returns {Promise<void>}
 */
const updateSectionsOrder = async (sectionOrders, transaction) => {
  for (const item of sectionOrders) {
    const singleUpdateRequest = transaction.request();
    singleUpdateRequest.input(`SectionID_${item.id}`, sql.BigInt, item.id);
    singleUpdateRequest.input(`SectionOrder_${item.id}`, sql.Int, item.order);
    singleUpdateRequest.input(
      `UpdatedAt_${item.id}`,
      sql.DateTime2,
      new Date()
    );

    await singleUpdateRequest.query(`
      UPDATE Sections
      SET SectionOrder = @SectionOrder_${item.id}, UpdatedAt = @UpdatedAt_${item.id}
      WHERE SectionID = @SectionID_${item.id};
    `);
  }
};

/**
 * Lấy tất cả sections của một khóa học, bao gồm cả lessons và các chi tiết con của lesson.
 * @param {number} courseId
 * @param {object} [transaction=null] - Optional transaction.
 * @returns {Promise<Array<Section>>} - Mảng các section với lessons lồng nhau.
 */
const findAllSectionsWithDetails = async (courseId, transaction = null) => {
  logger.debug(`Fetching all sections with details for course ${courseId}`);
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('CourseID', sql.BigInt, courseId);

  try {
    const sectionsResult = await executor.query(`
          SELECT *
          FROM Sections
          WHERE CourseID = @CourseID
          ORDER BY SectionOrder ASC;
      `);
    const sections = sectionsResult.recordset;

    if (sections.length === 0) {
      return [];
    }

    const sectionIds = sections.map((s) => s.SectionID);
    const lessons =
      await lessonRepository.findAllLessonsWithDetailsBySectionIds(
        sectionIds,
        transaction
      );

    const sectionMap = new Map(
      sections.map((s) => [s.SectionID, { ...s, lessons: [] }])
    );
    lessons.forEach((lesson) => {
      const section = sectionMap.get(lesson.SectionID);
      if (section) {
        if (!Array.isArray(section.lessons)) {
          section.lessons = [];
        }
        section.lessons.push(lesson);
      }
    });

    sectionMap.forEach((section) => {
      if (section.lessons) {
        section.lessons.sort(
          (a, b) => (a.LessonOrder ?? 0) - (b.LessonOrder ?? 0)
        );
      }
    });

    return Array.from(sectionMap.values());
  } catch (error) {
    logger.error(
      `Error fetching sections with details for course ${courseId}:`,
      error
    );
    throw error;
  }
};

/**
 * Xóa nhiều section bằng IDs (và các bản ghi con liên quan thông qua CASCADE).
 * @param {Array<number>} sectionIds - Mảng các SectionID cần xóa.
 * @param {object} transaction - Transaction object.
 * @returns {Promise<number>} - Số lượng section đã xóa.
 */
const deleteSectionsByIds = async (sectionIds, transaction) => {
  if (!sectionIds || sectionIds.length === 0) return 0;

  const request = transaction.request();
  const idPlaceholders = sectionIds
    .map((_, index) => `@id_sec_del_${index}`)
    .join(',');
  sectionIds.forEach((id, index) =>
    request.input(`id_sec_del_${index}`, sql.BigInt, id)
  );

  try {
    const result = await request.query(`
          DELETE FROM Sections
          WHERE SectionID IN (${idPlaceholders});
      `);
    logger.info(`Deleted ${result.rowsAffected[0]} sections.`);
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(
      `Error bulk deleting sections: ${sectionIds.join(', ')}`,
      error
    );
    if (error.number === 547) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to delete related section data. Check FK constraints.'
      );
    }
    throw error;
  }
};

module.exports = {
  getMaxSectionOrder,
  createSection,
  findSectionById,
  deleteSectionsByIds,
  findAllSectionsWithDetails,
  findSectionsByCourseId,
  updateSectionById,
  deleteSectionById,
  updateSectionsOrder,
};
