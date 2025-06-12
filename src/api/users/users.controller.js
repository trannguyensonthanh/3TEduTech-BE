const httpStatus = require('http-status').status;
const userService = require('./users.service');
const { catchAsync } = require('../../utils/catchAsync');
const { pick } = require('../../utils/pick');
const ApiError = require('../../core/errors/ApiError');

// --- User Routes ---
const getMyProfile = catchAsync(async (req, res) => {
  const profile = await userService.getUserProfile(req.user.id);
  res.status(httpStatus.OK).send(profile);
});

const updateMyProfile = catchAsync(async (req, res) => {
  const updatedProfile = await userService.updateUserProfile(
    req.user.id,
    req.body
  );
  res.status(httpStatus.OK).send(updatedProfile);
});

// --- Admin Routes ---
const getUsers = catchAsync(async (req, res) => {
  const filters = pick(req.query, ['searchTerm', 'role', 'status']);
  const options = pick(req.query, ['limit', 'page']);
  const result = await userService.getUsers({ ...filters, ...options });
  res.status(httpStatus.OK).send(result);
});

const getUser = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.userId);
  res.status(httpStatus.OK).send(user);
});

const updateUserStatus = catchAsync(async (req, res) => {
  await userService.updateUserStatus(req.params.userId, req.body.status);
  res
    .status(httpStatus.OK)
    .send({ message: 'Cập nhật trạng thái người dùng thành công.' });
});

const updateUserRole = catchAsync(async (req, res) => {
  await userService.updateUserRole(req.params.userId, req.body.roleId);
  res
    .status(httpStatus.OK)
    .send({ message: 'Cập nhật vai trò người dùng thành công.' });
});

const updateMyAvatar = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Vui lòng cung cấp file ảnh đại diện.'
    );
  }
  const updatedProfile = await userService.updateUserAvatar(
    req.user.id,
    req.file
  );
  res.status(httpStatus.OK).send(updatedProfile);
});

module.exports = {
  getMyProfile,
  updateMyProfile,
  // Admin
  getUsers,
  getUser,
  updateUserStatus,
  updateUserRole,
  updateMyAvatar,
};
