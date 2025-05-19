// Đường dẫn đến file auth.controller.js
const httpStatus = require('http-status').status;
const qs = require('qs'); // Cần để tạo query string
const authService = require('./auth.service');
const { catchAsync } = require('../../utils/catchAsync'); // Tạo hàm catchAsync nếu chưa có
const logger = require('../../utils/logger');
const config = require('../../config'); // Cần để lấy frontend URL
const {
  generateAccessToken,
  generateRefreshToken,
} = require('../../utils/generateToken');
const ApiError = require('../../core/errors/ApiError');
// Cần để tạo token
const register = catchAsync(async (req, res) => {
  const user = await authService.register(req.body);

  // Không trả về password hoặc token ở đây
  res.status(httpStatus.CREATED).send({
    message: user.message, // "Đăng ký thành công..."
    user: {
      // Chỉ trả về thông tin cơ bản, không nhạy cảm
      accountId: user.accountId,
      email: user.email,
      role: user.role,
      status: user.status,
    },
  });
});
const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  // Gọi service để xử lý đăng nhập
  const result = await authService.login(email, password);
  console.log('Login result:', req.cookies); // Log kết quả để kiểm tra

  // Lưu refresh token mới vào cookie
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: config.env === 'production',
    maxAge: config.jwt.refreshExpirationDays * 24 * 60 * 60 * 1000,
    path: '/v1/auth',
  });

  // Log thông tin cookie để kiểm tra
  console.log('Cookies after login:', res.getHeaders()['set-cookie']);

  // Trả về access token và thông tin user
  res.status(httpStatus.OK).send({
    accessToken: result.accessToken,
    user: result.user,
  });
});

const refreshTokens = catchAsync(async (req, res) => {
  const providedRefreshToken = req.cookies.refreshToken;
  if (!providedRefreshToken) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Yêu cầu Refresh Token.');
  }

  // Gọi service với token đọc từ cookie
  const result = await authService.refreshAuth(providedRefreshToken);
  res.status(httpStatus.OK).send({ accessToken: result.accessToken }); // Chỉ trả về access token mới
});

const verifyEmail = catchAsync(async (req, res) => {
  const { token } = req.query;
  await authService.verifyEmail(token);
  // Có thể redirect người dùng đến trang login hoặc thông báo thành công
  res
    .status(httpStatus.OK)
    .send({ message: 'Xác thực email thành công. Bạn có thể đăng nhập.' });
});

const requestPasswordReset = catchAsync(async (req, res) => {
  const { email } = req.body;
  await authService.requestPasswordReset(email);
  // Luôn trả về thành công để tránh lộ email có tồn tại hay không
  res.status(httpStatus.OK).send({
    message:
      'Nếu email của bạn tồn tại trong hệ thống, bạn sẽ nhận được hướng dẫn reset mật khẩu.',
  });
});

const resetPassword = catchAsync(async (req, res) => {
  const { token } = req.query;
  const { newPassword } = req.body;
  await authService.resetPassword(token, newPassword);
  res.status(httpStatus.OK).send({
    message:
      'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.',
  });
});

// Thêm logout nếu cần (ví dụ: blacklist refresh token)
const logout = catchAsync(async (req, res) => {
  console.log('Cookies before clearing:', req.cookies.refreshToken);

  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: config.env === 'production',
    path: '/v1/auth', // Đảm bảo khớp với path khi cookie được tạo
  });
  console.log('Cookies after logout:', res.getHeaders()['set-cookie']);
  res
    .status(200)
    .send({ message: 'Đăng xuất và xóa tất cả cookie thành công.' });
});
// /**
//  * Xử lý callback sau khi đăng nhập mạng xã hội thành công.
//  * Passport đã xác thực và gắn req.user.
//  * Tạo tokens và chuyển hướng về frontend.
//  */
// const handleSocialLoginCallback = catchAsync(async (req, res) => {
//   if (!req.user) {
//     // Trường hợp này không nên xảy ra nếu passport authenticate thành công
//     logger.error(
//       'Social login callback error: req.user not found after passport authentication.'
//     );
//     // Chuyển hướng về trang lỗi trên frontend
//     return res.redirect(
//       `${config.frontendUrl}/login/failed?error=authentication_failed`
//     );
//   }

//   // req.user chứa payload từ hàm done() của Passport verify callback
//   const userPayload = req.user;

//   // Tạo Access Token và Refresh Token
//   const accessToken = generateAccessToken({
//     accountId: userPayload.accountId,
//     role: userPayload.role,
//   });
//   const refreshToken = generateRefreshToken({
//     accountId: userPayload.accountId,
//   });

//   // *** Gửi Refresh Token qua HTTPOnly Cookie ***
//   res.cookie('refreshToken', refreshToken, {
//     httpOnly: true,
//     secure: config.env === 'production',
//     // maxAge tính bằng mili giây
//     maxAge: config.jwt.refreshExpirationDays * 24 * 60 * 60 * 1000,
//     sameSite: 'Lax', // 'Lax' thường phù hợp cho redirect sau login
//     path: '/v1/auth', // Chỉ gửi cookie cho các API trong /v1/auth (chứa API refresh) - Cần kiểm tra path này có đúng với route refresh token không
//     // domain: config.env === 'production' ? '.yourdomain.com' : undefined // Cần thiết nếu frontend và backend ở subdomain khác nhau trên production
//   });

//   // *** Chuyển hướng về frontend chỉ với Access Token và thông tin cơ bản (qua query params) ***
//   const queryParams = {
//     accessToken,
//     userId: userPayload.accountId,
//     role: userPayload.role,
//   };
//   const redirectUrl = `${config.frontendUrl}/auth/social-success?${qs.stringify(
//     queryParams
//   )}`;

//   logger.info(
//     `Social login successful for AccountID ${userPayload.accountId}. Redirecting to frontend.`
//   );
//   res.redirect(redirectUrl);
// });

const registerInstructor = catchAsync(async (req, res) => {
  const user = await authService.registerInstructor(req.body);
  res.status(httpStatus.CREATED).send({
    message: user.message,
    user: {
      accountId: user.accountId,
      email: user.email,
      role: user.role,
      status: user.status,
    },
  });
});

// --- Controller mới cho Social Login ---
const loginWithGoogle = catchAsync(async (req, res) => {
  const { idToken } = req.body; // *** Nhận idToken ***
  const result = await authService.loginWithGoogle(idToken);

  // Gửi Refresh Token qua cookie
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: config.env === 'production',
    maxAge: config.jwt.refreshExpirationDays * 24 * 60 * 60 * 1000,
    path: '/v1/auth',
  });

  // Trả về Access Token và thông tin user
  res.status(httpStatus.OK).send({
    accessToken: result.accessToken,
    user: result.user,
  });
});

const loginWithFacebook = catchAsync(async (req, res) => {
  const { accessToken } = req.body; // Nhận accessToken từ frontend
  const result = await authService.loginWithFacebook(accessToken);

  // Gửi Refresh Token qua cookie
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: config.env === 'production',
    maxAge: config.jwt.refreshExpirationDays * 24 * 60 * 60 * 1000,
    path: '/v1/auth',
  });

  // Trả về Access Token và thông tin user
  res.status(httpStatus.OK).send({
    accessToken: result.accessToken,
    user: result.user,
  });
});

const completeFacebookRegistration = catchAsync(async (req, res) => {
  const { accessToken, email } = req.body;
  const result = await authService.completeFacebookRegistration(
    accessToken,
    email
  );
  res.status(httpStatus.OK).send(result); // Trả về message yêu cầu check mail
});

const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  // req.user.id được gắn bởi middleware 'authenticate'
  await authService.changePassword(req.user.id, currentPassword, newPassword);
  res.status(httpStatus.OK).send({ message: 'Đổi mật khẩu thành công.' });
});

module.exports = {
  register,
  login,
  logout, // Thêm logout
  refreshTokens,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  // handleSocialLoginCallback,
  registerInstructor,
  loginWithGoogle,
  loginWithFacebook,
  completeFacebookRegistration,
  changePassword,
};
