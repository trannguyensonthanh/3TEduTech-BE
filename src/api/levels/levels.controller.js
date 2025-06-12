const httpStatus = require('http-status').status;
const levelService = require('./levels.service');
const { catchAsync } = require('../../utils/catchAsync');

/**
 * Create a new level
 */
const createLevel = catchAsync(async (req, res) => {
  const level = await levelService.createLevel(req.body);
  res.status(httpStatus.CREATED).send(level);
});

/**
 * Get all levels
 */
const getLevels = catchAsync(async (req, res) => {
  const levels = await levelService.getLevels();
  res.status(httpStatus.OK).send({ levels });
});

/**
 * Get a level by ID
 */
const getLevel = catchAsync(async (req, res) => {
  const level = await levelService.getLevel(req.params.levelId);
  res.status(httpStatus.OK).send(level);
});

/**
 * Update a level by ID
 */
const updateLevel = catchAsync(async (req, res) => {
  const level = await levelService.updateLevel(req.params.levelId, req.body);
  res.status(httpStatus.OK).send(level);
});

/**
 * Delete a level by ID
 */
const deleteLevel = catchAsync(async (req, res) => {
  await levelService.deleteLevel(req.params.levelId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createLevel,
  getLevels,
  getLevel,
  updateLevel,
  deleteLevel,
};
