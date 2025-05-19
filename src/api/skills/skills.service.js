const httpStatus = require('http-status').status;
const skillsRepository = require('./skills.repository');
const ApiError = require('../../core/errors/ApiError');
const { toCamelCaseObject } = require('../../utils/caseConverter');

const createSkill = async (skillData) => {
  // Admin mới được tạo?
  const { skillName, description } = skillData;
  // Repo đã check trùng tên
  return skillsRepository.createSkill({ skillName, description });
};

const getSkills = async (options) => {
  const { page = 1, limit = 0, searchTerm = '' } = options; // limit 0 = get all
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

const getSkill = async (skillId) => {
  const skill = await skillsRepository.findSkillById(skillId);
  if (!skill) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy kỹ năng.');
  }
  return skill;
};

const updateSkill = async (skillId, updateData) => {
  // Admin mới được sửa?
  await getSkill(skillId); // Check existence
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

  // Repo sẽ check trùng tên khi update
  const updatedSkill = await skillsRepository.updateSkillById(
    skillId,
    dataToUpdate
  );
  if (!updatedSkill) {
    // Trường hợp không có gì thay đổi
    return getSkill(skillId);
  }
  return updatedSkill;
};

const deleteSkill = async (skillId) => {
  // Admin mới được xóa?
  await getSkill(skillId); // Check existence
  // Repo sẽ check FK constraint
  const deletedCount = await skillsRepository.deleteSkillById(skillId);
  if (deletedCount === 0) {
    // Lỗi không mong muốn
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
