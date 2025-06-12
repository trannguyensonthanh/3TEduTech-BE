// File: src/api/admin/admin.validation.js
const Joi = require('joi');

// API này không cần query params hay body nên validation rỗng
const getDashboardOverview = {};

module.exports = {
  getDashboardOverview,
};
