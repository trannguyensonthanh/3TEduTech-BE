const httpStatus = require('http-status').status;
const levelRepository = require('./levels.repository');
const ApiError = require('../../core/errors/ApiError');
const { toCamelCaseObject } = require('../../utils/caseConverter');

/**
 * Tạo cấp độ mới
 */
const createLevel = async (levelData) => {
  const { levelName } = levelData;
  const existingName = await levelRepository.findLevelByName(levelName);
  if (existingName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Tên cấp độ đã tồn tại.');
  }
  return levelRepository.createLevel({ levelName });
};

/**
 * Lấy danh sách cấp độ
 */
const getLevels = async () => {
  const levels = await levelRepository.findAllLevels();
  return toCamelCaseObject(levels);
};

/**
 * Lấy thông tin cấp độ theo ID
 */
const getLevel = async (levelId) => {
  const level = await levelRepository.findLevelById(levelId);
  if (!level) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy cấp độ.');
  }
  return toCamelCaseObject(level);
};

/**
 * Cập nhật cấp độ
 */
const updateLevel = async (levelId, updateData) => {
  const level = await getLevel(levelId);
  const { levelName } = updateData;

  if (levelName && levelName !== level.LevelName) {
    const existingName = await levelRepository.findLevelByName(levelName);
    if (existingName && existingName.LevelID !== levelId) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Tên cấp độ đã tồn tại.');
    }
    const updatedLevel = await levelRepository.updateLevelById(levelId, {
      levelName,
    });
    return updatedLevel;
  }
  return level;
};

/**
 * Xóa cấp độ
 */
const deleteLevel = async (levelId) => {
  await getLevel(levelId);
  const courseCount = await levelRepository.countCoursesInLevel(levelId);
  if (courseCount > 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Không thể xóa cấp độ vì đang có ${courseCount} khóa học sử dụng.`
    );
  }
  await levelRepository.deleteLevelById(levelId);
};

module.exports = {
  createLevel,
  getLevels,
  getLevel,
  updateLevel,
  deleteLevel,
};
