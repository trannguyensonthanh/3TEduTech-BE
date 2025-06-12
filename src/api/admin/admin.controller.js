// File: src/api/admin/admin.controller.js

const httpStatus = require('http-status').status;
const adminService = require('./admin.service');
const { catchAsync } = require('../../utils/catchAsync');

const getDashboardOverview = catchAsync(async (req, res) => {
  const data = await adminService.getDashboardOverview();
  res.status(httpStatus.OK).send(data);
});

module.exports = {
  getDashboardOverview,
};
