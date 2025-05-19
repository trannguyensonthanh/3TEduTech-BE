// src/api/lessons/subtitle.routes.js
const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const subtitleValidation = require('./subtitle.validation');
const subtitleController = require('./subtitle.controller');
const {
  authenticate,
  authorize,
} = require('../../middlewares/auth.middleware');
const Roles = require('../../core/enums/Roles');

// Router này sẽ được mount vào /lessons/:lessonId/subtitles
const router = express.Router({ mergeParams: true }); // Cần mergeParams để lấy lessonId

// Lấy danh sách phụ đề (có thể cần authenticate hoặc không tùy logic xem)
router.get(
  '/',
  // authenticate, // Bỏ authenticate nếu muốn public có thể xem list?
  validate(subtitleValidation.getSubtitles),
  subtitleController.getSubtitles
);

// Các thao tác quản lý cần authenticate và quyền Instructor/Admin
router.use(
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN])
);

router.post(
  // Thêm phụ đề mới
  '/',
  (req, res, next) => {
    console.log('Request Body:', req.body);
    console.log('Request Params:', req.params);
    console.log('Request Query:', req.query);
    next();
  },
  validate(subtitleValidation.addSubtitle),
  subtitleController.addSubtitle
);

router.patch(
  // Cập nhật phụ đề
  '/:subtitleId/set-primary',
  validate(subtitleValidation.setPrimary),
  subtitleController.setPrimarySubtitle
);

router.delete(
  // Xóa phụ đề
  '/:subtitleId',
  validate(subtitleValidation.deleteSubtitle),
  subtitleController.deleteSubtitle
);

module.exports = router; // Export router này
