const httpStatus = require('http-status').status;
const skillsRepository = require('./skills.repository');
const ApiError = require('../../core/errors/ApiError');
const { toCamelCaseObject } = require('../../utils/caseConverter');

/**
 * Tạo kỹ năng mới
 */
const createSkill = async (skillData) => {
  const { skillName, description } = skillData;
  return skillsRepository.createSkill({ skillName, description });
};

/**
 * Lấy danh sách kỹ năng
 */
const getSkills = async (options) => {
  const { page = 1, limit = 0, searchTerm = '' } = options;
  const result = await skillsRepository.findAllSkills({
    page,
    limit,
    searchTerm,
  });
  if (limit > 0) {
    return {
      skills: toCamelCaseObject(result.skills),
      total: result.total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      totalPages: Math.ceil(result.total / limit),
    };
  }
  return { skills: toCamelCaseObject(result.skills) };
};

/**
 * Lấy kỹ năng theo ID
 */
const getSkill = async (skillId) => {
  const skill = await skillsRepository.findSkillById(skillId);
  if (!skill) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy kỹ năng.');
  }
  return skill;
};

/**
 * Cập nhật kỹ năng
 */
const updateSkill = async (skillId, updateData) => {
  await getSkill(skillId);
  const { skillName, description } = updateData;
  const dataToUpdate = {};
  if (skillName !== undefined) dataToUpdate.skillName = skillName;
  if (description !== undefined) dataToUpdate.description = description;

  if (Object.keys(dataToUpdate).length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Không có thông tin để cập nhật.'
    );
  }

  const updatedSkill = await skillsRepository.updateSkillById(
    skillId,
    dataToUpdate
  );
  if (!updatedSkill) {
    return getSkill(skillId);
  }
  return updatedSkill;
};

/**
 * Xóa kỹ năng
 */
const deleteSkill = async (skillId) => {
  await getSkill(skillId);
  const deletedCount = await skillsRepository.deleteSkillById(skillId);
  if (deletedCount === 0) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Xóa kỹ năng thất bại.'
    );
  }
};

module.exports = {
  createSkill,
  getSkills,
  getSkill,
  updateSkill,
  deleteSkill,
};
