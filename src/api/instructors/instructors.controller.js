// file: src/api/instructors/instructors.controller.js

const httpStatus = require('http-status').status;
const { pick } = require('lodash');
const instructorService = require('./instructors.service');
const { catchAsync } = require('../../utils/catchAsync');
const ApiError = require('../../core/errors/ApiError');
const logger = require('../../utils/logger');

const getMyProfile = catchAsync(async (req, res) => {
  const profile = await instructorService.getMyInstructorProfile(req.user.id);
  res.status(httpStatus.OK).send(profile);
});

const updateMyProfile = catchAsync(async (req, res) => {
  const profile = await instructorService.updateMyInstructorProfile(
    req.user.id,
    req.body
  );
  res.status(httpStatus.OK).send(profile);
});

const addMySkill = catchAsync(async (req, res) => {
  const skills = await instructorService.addMySkill(
    req.user.id,
    req.body.skillId
  );
  res.status(httpStatus.OK).send({ skills });
});

const removeMySkill = catchAsync(async (req, res) => {
  const skills = await instructorService.removeMySkill(
    req.user.id,
    req.params.skillId
  );
  res.status(httpStatus.OK).send({ skills });
});

const addOrUpdateMySocialLink = catchAsync(async (req, res) => {
  const { platform, url } = req.body;
  const links = await instructorService.addOrUpdateMySocialLink(
    req.user.id,
    platform,
    url
  );
  res.status(httpStatus.OK).send({ socialLinks: links });
});

const removeMySocialLink = catchAsync(async (req, res) => {
  const links = await instructorService.removeMySocialLink(
    req.user.id,
    req.params.platform
  );
  res.status(httpStatus.OK).send({ socialLinks: links });
});

const getInstructorPublicProfile = catchAsync(async (req, res) => {
  const profile = await instructorService.getInstructorPublicProfile(
    req.params.instructorId
  );
  res.status(httpStatus.OK).send(profile);
});

const getInstructors = catchAsync(async (req, res) => {
  const filterOptions = pick(req.query, ['searchTerm', 'skillId', 'minRating']);
  const paginationOptions = pick(req.query, ['page', 'limit', 'sortBy']);

  const result = await instructorService.queryInstructors(
    filterOptions,
    paginationOptions
  );
  res.status(httpStatus.OK).send(result);
});

const getMyStudents = catchAsync(async (req, res) => {
  const instructorId = req.user.id;
  logger.info(req.user);
  const query = {
    page: req.query.page,
    limit: req.query.limit,
    searchTerm: req.query.searchTerm,
    status: req.query.status,
    courseId: req.query.courseId,
    sortBy: req.query.sortBy,
  };
  const result = await instructorService.getStudentsOfInstructor(
    Number(instructorId),
    query
  );
  res.status(httpStatus.OK).send(result);
});

const getMyFinancialOverview = catchAsync(async (req, res) => {
  const overview = await instructorService.getMyFinancialOverview(req.user.id);
  res.status(httpStatus.OK).send(overview);
});

module.exports = {
  getMyProfile,
  updateMyProfile,
  addMySkill,
  removeMySkill,
  addOrUpdateMySocialLink,
  removeMySocialLink,
  getInstructorPublicProfile,
  getInstructors,
  getMyFinancialOverview,
  getMyStudents,
};
