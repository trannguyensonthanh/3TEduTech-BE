const httpStatus = require('http-status').status;
const levelService = require('./levels.service');
const { catchAsync } = require('../../utils/catchAsync');

const createLevel = catchAsync(async (req, res) => {
  const level = await levelService.createLevel(req.body);
  res.status(httpStatus.CREATED).send(level);
});

const getLevels = catchAsync(async (req, res) => {
  const levels = await levelService.getLevels();
  res.status(httpStatus.OK).send({ levels }); // Wrap in object for consistency
});

const getLevel = catchAsync(async (req, res) => {
  const level = await levelService.getLevel(req.params.levelId);
  res.status(httpStatus.OK).send(level);
});

const updateLevel = catchAsync(async (req, res) => {
  const level = await levelService.updateLevel(req.params.levelId, req.body);
  res.status(httpStatus.OK).send(level);
});

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
