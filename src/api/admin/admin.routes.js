// File: src/api/admin/admin.routes.js

const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const adminValidation = require('./admin.validation');
const adminController = require('./admin.controller');
const {
  authenticate,
  authorize,
} = require('../../middlewares/auth.middleware');
const Roles = require('../../core/enums/Roles');

const router = express.Router();

// Bảo vệ toàn bộ các route trong file này, chỉ Admin/SuperAdmin được truy cập
router.use(authenticate, authorize([Roles.ADMIN, Roles.SUPERADMIN]));

router.get(
  '/dashboard/overview',
  validate(adminValidation.getDashboardOverview),
  adminController.getDashboardOverview
);

module.exports = router;
