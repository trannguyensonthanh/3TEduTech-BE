const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const subtitleValidation = require('./subtitle.validation');
const subtitleController = require('./subtitle.controller');
const {
  authenticate,
  authorize,
} = require('../../middlewares/auth.middleware');
const Roles = require('../../core/enums/Roles');

const router = express.Router({ mergeParams: true });

router.get(
  '/',
  validate(subtitleValidation.getSubtitles),
  subtitleController.getSubtitles
);

// Các thao tác quản lý cần authenticate và quyền Instructor/Admin
router.use(
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN])
);

// Thêm phụ đề mới
router.post(
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

// Cập nhật phụ đề
router.patch(
  '/:subtitleId/set-primary',
  validate(subtitleValidation.setPrimary),
  subtitleController.setPrimarySubtitle
);

// Xóa phụ đề
router.delete(
  '/:subtitleId',
  validate(subtitleValidation.deleteSubtitle),
  subtitleController.deleteSubtitle
);

module.exports = router;
