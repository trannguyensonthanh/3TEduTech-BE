// đường dẫn: src/api/auth/auth.controller.js
const httpStatus = require('http-status').status;
const authService = require('./auth.service');
const { catchAsync } = require('../../utils/catchAsync');
const config = require('../../config');
const ApiError = require('../../core/errors/ApiError');

const register = catchAsync(async (req, res) => {
  const user = await authService.register(req.body);
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

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password);
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: config.env === 'production',
    maxAge: config.jwt.refreshExpirationDays * 24 * 60 * 60 * 1000,
    path: '/v1/auth',
  });
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
  const result = await authService.refreshAuth(providedRefreshToken);
  res.status(httpStatus.OK).send({ accessToken: result.accessToken });
});

const verifyEmail = catchAsync(async (req, res) => {
  const { token } = req.query;
  await authService.verifyEmail(token);
  res
    .status(httpStatus.OK)
    .send({ message: 'Xác thực email thành công. Bạn có thể đăng nhập.' });
});

const requestPasswordReset = catchAsync(async (req, res) => {
  const { email } = req.body;
  await authService.requestPasswordReset(email);
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

const logout = catchAsync(async (req, res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: config.env === 'production',
    path: '/v1/auth',
  });
  res
    .status(200)
    .send({ message: 'Đăng xuất và xóa tất cả cookie thành công.' });
});

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

const loginWithGoogle = catchAsync(async (req, res) => {
  const { idToken } = req.body;
  const result = await authService.loginWithGoogle(idToken);
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: config.env === 'production',
    maxAge: config.jwt.refreshExpirationDays * 24 * 60 * 60 * 1000,
    path: '/v1/auth',
  });
  res.status(httpStatus.OK).send({
    accessToken: result.accessToken,
    user: result.user,
  });
});

const loginWithFacebook = catchAsync(async (req, res) => {
  const { accessToken } = req.body;
  const result = await authService.loginWithFacebook(accessToken);
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: config.env === 'production',
    maxAge: config.jwt.refreshExpirationDays * 24 * 60 * 60 * 1000,
    path: '/v1/auth',
  });
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
  res.status(httpStatus.OK).send(result);
});

const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(req.user.id, currentPassword, newPassword);
  res.status(httpStatus.OK).send({ message: 'Đổi mật khẩu thành công.' });
});

module.exports = {
  register,
  login,
  logout,
  refreshTokens,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  registerInstructor,
  loginWithGoogle,
  loginWithFacebook,
  completeFacebookRegistration,
  changePassword,
};
