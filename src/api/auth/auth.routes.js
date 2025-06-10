// file auth.routes.js
const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const authValidation = require('./auth.validation');
const authController = require('./auth.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const passport = require('../../config/passport');

const router = express.Router();

router.post(
  '/register',
  validate(authValidation.register),
  authController.register
);

router.post('/login', validate(authValidation.login), authController.login);
router.post('/logout', authenticate, authController.logout);
router.post(
  '/refresh-tokens',
  validate(authValidation.refreshTokens),
  authController.refreshTokens
);
router.get(
  '/verify-email',
  validate(authValidation.verifyEmail),
  authController.verifyEmail
);
router.post(
  '/request-password-reset',
  validate(authValidation.requestPasswordReset),
  authController.requestPasswordReset
);
router.post(
  '/reset-password',
  validate(authValidation.resetPassword),
  authController.resetPassword
);

router.post(
  '/change-password',
  authenticate,
  validate(authValidation.changePassword),
  authController.changePassword
);

router.post(
  '/register/instructor',
  validate(authValidation.registerInstructor),
  authController.registerInstructor
);

router.post(
  '/google/login',
  validate(authValidation.googleLogin),
  authController.loginWithGoogle
);

router.post(
  '/facebook/login',
  validate(authValidation.facebookLogin),
  authController.loginWithFacebook
);

router.post(
  '/facebook/complete-registration',
  validate(authValidation.completeFacebookRegistration),
  authController.completeFacebookRegistration
);

module.exports = router;
