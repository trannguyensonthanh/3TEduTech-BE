// src/api/languages/languages.routes.js
const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const languageValidation = require('./languages.validation');
const languageController = require('./languages.controller');
const {
  authenticate,
  authorize,
} = require('../../middlewares/auth.middleware');
const Roles = require('../../core/enums/Roles');

const router = express.Router();

// Lấy danh sách ngôn ngữ (Public/Authenticated User)
router.get(
  '/',
  validate(languageValidation.getLanguages), // Validation cho query params
  languageController.getLanguages
);

// Lấy chi tiết một ngôn ngữ (Public/Authenticated User)
router.get(
  '/:languageCode',
  validate(languageValidation.getLanguage),
  languageController.getLanguage
);

// Các routes quản lý chỉ dành cho Admin
router.use(authenticate, authorize([Roles.ADMIN, Roles.SUPERADMIN]));

router.post(
  '/',
  validate(languageValidation.createLanguage),
  languageController.createLanguage
);

router
  .route('/:languageCode')
  // .get(...) // Đã định nghĩa ở trên cho public
  .patch(
    validate(languageValidation.updateLanguage),
    languageController.updateLanguage
  )
  .delete(
    validate(languageValidation.deleteLanguage),
    languageController.deleteLanguage
  );

module.exports = router;
