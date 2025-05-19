const httpStatus = require('http-status').status;
const skillsService = require('./skills.service');
const { catchAsync } = require('../../utils/catchAsync');
const { pick } = require('../../utils/pick');

const createSkill = catchAsync(async (req, res) => {
  const skill = await skillsService.createSkill(req.body);
  res.status(httpStatus.CREATED).send(skill);
});

const getSkills = catchAsync(async (req, res) => {
  const options = pick(req.query, ['limit', 'page', 'searchTerm']);
  const result = await skillsService.getSkills(options);
  res.status(httpStatus.OK).send(result);
});

const getSkill = catchAsync(async (req, res) => {
  const skill = await skillsService.getSkill(req.params.skillId);
  res.status(httpStatus.OK).send(skill);
});

const updateSkill = catchAsync(async (req, res) => {
  const skill = await skillsService.updateSkill(req.params.skillId, req.body);
  res.status(httpStatus.OK).send(skill);
});

const deleteSkill = catchAsync(async (req, res) => {
  await skillsService.deleteSkill(req.params.skillId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createSkill,
  getSkills,
  getSkill,
  updateSkill,
  deleteSkill,
};
