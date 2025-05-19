// file auth.routes.js
const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const authValidation = require('./auth.validation');
const authController = require('./auth.controller');
const { authenticate } = require('../../middlewares/auth.middleware'); // Cần authenticate cho logout
const passport = require('../../config/passport');

const router = express.Router();

router.post(
  '/register',
  validate(authValidation.register),
  authController.register
);

router.post('/login', validate(authValidation.login), authController.login);
router.post('/logout', authenticate, authController.logout); // Cần đăng nhập để logout
router.post(
  '/refresh-tokens',
  validate(authValidation.refreshTokens),
  authController.refreshTokens
);
router.get(
  '/verify-email',
  validate(authValidation.verifyEmail),
  authController.verifyEmail
); // Dùng GET vì link trong email
router.post(
  '/request-password-reset',
  validate(authValidation.requestPasswordReset),
  authController.requestPasswordReset
);
router.post(
  '/reset-password',
  validate(authValidation.resetPassword),
  authController.resetPassword
); // Dùng POST để gửi token trong query và newPassword trong body
// --- Thêm Google OAuth Routes ---
// Bước 1: Chuyển hướng đến Google
// router.get(
//   '/google',
//   passport.authenticate('google', {
//     scope: ['profile', 'email'], // Yêu cầu quyền truy cập profile và email
//     session: false, // Không sử dụng session
//   })
// );

// Bước 2: Google gọi lại URL này sau khi user đồng ý
// router.get(
//   '/google/callback',
//   passport.authenticate('google', {
//     // failureRedirect: '/login/failed', // URL chuyển hướng nếu lỗi (trên frontend)
//     // successRedirect: '/', // URL chuyển hướng nếu thành công (trên frontend)
//     session: false, // Không sử dụng session
//   }),
//   authController.handleSocialLoginCallback // Controller xử lý sau khi passport authenticate thành công
// );

// --- Thêm Facebook OAuth Routes ---
// Bước 1: Chuyển hướng đến Facebook
// router.get(
//   '/facebook',
//   passport.authenticate('facebook', {
//     scope: ['email', 'public_profile'], // Quyền cơ bản
//     session: false,
//   })
// );

// // Bước 2: Facebook gọi lại URL này
// router.get(
//   '/facebook/callback',
//   passport.authenticate('facebook', {
//     // failureRedirect: '/login/failed', // URL frontend nếu lỗi
//     session: false,
//   }),
//   authController.handleSocialLoginCallback // Dùng chung controller callback
// );

// --- Route đăng ký Instructor ---

// --- Route mới để người dùng đã đăng nhập tự thay đổi mật khẩu ---
router.post(
  '/change-password',
  authenticate, // Yêu cầu người dùng phải đăng nhập
  validate(authValidation.changePassword), // Sẽ tạo schema validation này
  authController.changePassword // Sẽ tạo controller method này
);

router.post(
  '/register/instructor',
  validate(authValidation.registerInstructor),
  authController.registerInstructor
);

// --- Routes mới cho Social Login (nhận code/token từ frontend) ---
router.post(
  '/google/login',
  validate(authValidation.googleLogin), // Validation mới
  authController.loginWithGoogle // Controller mới
);

router.post(
  '/facebook/login',
  validate(authValidation.facebookLogin), // Validation mới
  authController.loginWithFacebook // Controller mới
);

// --- Route mới để hoàn tất đăng ký Facebook khi thiếu email ---
router.post(
  '/facebook/complete-registration',
  validate(authValidation.completeFacebookRegistration), // Validation mới
  authController.completeFacebookRegistration // Controller mới
);

module.exports = router;
