const httpStatus = require('http-status').status;
const userRepository = require('./users.repository');
const authRepository = require('../auth/auth.repository');
const ApiError = require('../../core/errors/ApiError');
const logger = require('../../utils/logger');
const AccountStatus = require('../../core/enums/AccountStatus');
const Roles = require('../../core/enums/Roles');
const { toCamelCaseObject } = require('../../utils/caseConverter');
const cloudinaryUtil = require('../../utils/cloudinary.util');

/**
 * Lấy thông tin profile của người dùng hiện tại.
 * @param {number} accountId - ID từ token JWT.
 * @returns {Promise<object>} - Thông tin profile chi tiết.
 */
const getUserProfile = async (accountId) => {
  const profile = await userRepository.findUserProfileById(accountId);
  if (!profile) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Không tìm thấy thông tin người dùng.'
    );
  }
  return toCamelCaseObject(profile);
};

/**
 * Cập nhật thông tin profile của người dùng hiện tại.
 * @param {number} accountId - ID từ token JWT.
 * @param {object} updateBody - Dữ liệu cần cập nhật { FullName, AvatarUrl, ... }.
 * @returns {Promise<object>} - Thông tin profile đã cập nhật.
 */
const updateUserProfile = async (accountId, updateBody) => {
  const allowedUpdates = [
    'FullName',
    'AvatarUrl',
    'CoverImageUrl',
    'Gender',
    'BirthDate',
    'PhoneNumber',
    'Headline',
    'Location',
  ];
  const dataToUpdate = {};
  allowedUpdates.forEach((key) => {
    if (updateBody[key] !== undefined) {
      dataToUpdate[key] = updateBody[key];
    }
  });

  if (Object.keys(dataToUpdate).length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Không có thông tin hợp lệ để cập nhật.'
    );
  }

  if (dataToUpdate.PhoneNumber) {
    // TODO: Thêm logic kiểm tra tính duy nhất của PhoneNumber nếu cần
  }

  const rowsAffected = await userRepository.updateUserProfileById(
    accountId,
    dataToUpdate
  );
  if (rowsAffected === 0) {
    const exists = await authRepository.findAccountById(accountId);
    if (!exists) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Người dùng không tồn tại.');
    } else {
      logger.warn(
        `Update profile for ${accountId} affected 0 rows, possibly no change.`
      );
    }
  }

  const updatedProfile = await userRepository.findUserProfileById(accountId);
  return updatedProfile;
};

/**
 * Cập nhật ảnh đại diện của người dùng hiện tại.
 * @param {number} accountId - ID từ token JWT.
 * @param {object} file - File object từ multer (req.file).
 * @returns {Promise<object>} - Thông tin profile đã cập nhật.
 */
const updateUserAvatar = async (accountId, file) => {
  const userProfile = await userRepository.findUserProfileById(accountId);
  if (!userProfile) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Người dùng không tồn tại.');
  }

  if (userProfile.AvatarPublicId) {
    try {
      logger.info(
        `Attempting to delete old avatar from Cloudinary: ${userProfile.AvatarPublicId}`
      );
      await cloudinaryUtil.deleteAsset(userProfile.AvatarPublicId, {
        resource_type: 'image',
      });
      logger.info(
        `Old avatar ${userProfile.AvatarPublicId} deleted successfully.`
      );
    } catch (deleteError) {
      logger.error(
        `Failed to delete old avatar ${userProfile.AvatarPublicId} from Cloudinary:`,
        deleteError
      );
    }
  }

  let uploadResult;
  try {
    const options = {
      folder: `users/${accountId}/avatars`,
      resource_type: 'image',
    };
    logger.info(
      `Uploading new avatar for user ${accountId} with options:`,
      options
    );
    uploadResult = await cloudinaryUtil.uploadStream(file.buffer, options);
    logger.info(
      `New avatar uploaded successfully for user ${accountId}:`,
      uploadResult
    );
  } catch (uploadError) {
    logger.error(`Avatar upload failed for user ${accountId}:`, uploadError);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Upload ảnh đại diện thất bại.'
    );
  }

  const dataToUpdate = {
    AvatarUrl: uploadResult.secure_url,
    AvatarPublicId: uploadResult.public_id,
  };

  try {
    const rowsAffected = await userRepository.updateUserProfileById(
      accountId,
      dataToUpdate
    );
    if (rowsAffected === 0) {
      throw new Error('Failed to update user profile in DB.');
    }
  } catch (dbError) {
    logger.error(
      `Failed to update user profile for ${accountId} in DB after avatar upload. Uploaded public_id: ${uploadResult.public_id}. DB Error:`,
      dbError
    );
    try {
      await cloudinaryUtil.deleteAsset(uploadResult.public_id, {
        resource_type: 'image',
      });
      logger.info(
        `Rolled back avatar upload: Deleted ${uploadResult.public_id} from Cloudinary due to DB update failure.`
      );
    } catch (rollbackError) {
      logger.error(
        `Failed to rollback Cloudinary upload for ${uploadResult.public_id} after DB update failure:`,
        rollbackError
      );
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Cập nhật thông tin người dùng sau khi upload ảnh đại diện thất bại.'
    );
  }

  const updatedProfile = await userRepository.findUserProfileById(accountId);
  return toCamelCaseObject(updatedProfile);
};

/**
 * Lấy danh sách người dùng (Admin).
 * @param {object} queryOptions - Filter và pagination options.
 * @returns {Promise<object>} - { users, total, page, limit }.
 */
const getUsers = async (queryOptions) => {
  const { page = 1, limit = 10, ...filters } = queryOptions;
  const result = await userRepository.findAllAccounts({
    page,
    limit,
    ...filters,
  });
  return {
    users: toCamelCaseObject(result.users),
    total: result.total,
    page,
    limit,
    totalPages: Math.ceil(result.total / limit),
  };
};

/**
 * Lấy chi tiết một người dùng (Admin).
 * @param {number} userId
 * @returns {Promise<object>}
 */
const getUserById = async (userId) => {
  const user = await userRepository.findUserProfileById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy người dùng.');
  }
  return user;
};

/**
 * Cập nhật trạng thái người dùng (Admin).
 * @param {number} userId
 * @param {string} status - Trạng thái mới (ACTIVE, INACTIVE, BANNED).
 * @returns {Promise<void>}
 */
const updateUserStatus = async (userId, status) => {
  if (
    !Object.values(AccountStatus).includes(status) ||
    status === AccountStatus.PENDING_VERIFICATION
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Trạng thái không hợp lệ.');
  }

  const account = await authRepository.findAccountById(userId);
  if (!account) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Người dùng không tồn tại.');
  }

  const rowsAffected = await authRepository.updateAccountById(userId, {
    Status: status,
  });
  if (rowsAffected === 0) {
    logger.warn(`Update status for ${userId} to ${status} affected 0 rows.`);
  }
  logger.info(`Admin updated status for account ${userId} to ${status}`);
};

/**
 * Cập nhật vai trò người dùng (Admin).
 * @param {number} userId
 * @param {string} roleId - Vai trò mới.
 * @returns {Promise<void>}
 */
const updateUserRole = async (userId, roleId) => {
  if (!Object.values(Roles).includes(roleId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Vai trò không hợp lệ.');
  }

  const account = await authRepository.findAccountById(userId);
  if (!account) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Người dùng không tồn tại.');
  }

  const rowsAffected = await authRepository.updateAccountById(userId, {
    RoleID: roleId,
  });
  if (rowsAffected === 0) {
    logger.warn(`Update role for ${userId} to ${roleId} affected 0 rows.`);
  }
  logger.info(`Admin updated role for account ${userId} to ${roleId}`);
};

module.exports = {
  getUserProfile,
  updateUserProfile,
  updateUserAvatar,
  getUsers,
  getUserById,
  updateUserStatus,
  updateUserRole,
};
