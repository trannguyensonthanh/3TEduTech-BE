const httpStatus = require('http-status').status;
const userRepository = require('./users.repository');
const authRepository = require('../auth/auth.repository'); // Có thể cần để kiểm tra role, status
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
  // Loại bỏ các trường không cần thiết nếu muốn trước khi trả về
  // delete profile.HashedPassword; // Ví dụ (mặc dù findUserProfileById không lấy HashedPassword)
  return toCamelCaseObject(profile); // Chuyển đổi sang camelCase nếu cần
};

/**
 * Cập nhật thông tin profile của người dùng hiện tại.
 * @param {number} accountId - ID từ token JWT.
 * @param {object} updateBody - Dữ liệu cần cập nhật { FullName, AvatarUrl, ... }.
 * @returns {Promise<object>} - Thông tin profile đã cập nhật.
 */
const updateUserProfile = async (accountId, updateBody) => {
  // Validate dữ liệu đầu vào (ví dụ: không cho phép cập nhật Email, RoleID qua đây)
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
      // Cho phép cập nhật thành null/rỗng nếu user muốn
      dataToUpdate[key] = updateBody[key];
    }
  });

  if (Object.keys(dataToUpdate).length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Không có thông tin hợp lệ để cập nhật.'
    );
  }

  // Kiểm tra Phone Number nếu có cập nhật (ví dụ: đảm bảo duy nhất nếu nó thay đổi)
  if (dataToUpdate.PhoneNumber) {
    // TODO: Thêm logic kiểm tra tính duy nhất của PhoneNumber nếu cần
    // const existingPhone = await userRepository.findUserByPhone(dataToUpdate.PhoneNumber);
    // if (existingPhone && existingPhone.AccountID !== accountId) {
    //     throw new ApiError(httpStatus.BAD_REQUEST, 'Số điện thoại đã được sử dụng.');
    // }
  }

  const rowsAffected = await userRepository.updateUserProfileById(
    accountId,
    dataToUpdate
  );
  if (rowsAffected === 0) {
    // Có thể do accountId không tồn tại hoặc không có gì thay đổi thực sự
    // Kiểm tra xem user có tồn tại không
    const exists = await authRepository.findAccountById(accountId);
    if (!exists) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Người dùng không tồn tại.');
    } else {
      logger.warn(
        `Update profile for ${accountId} affected 0 rows, possibly no change.`
      );
      // Trả về profile hiện tại nếu không có lỗi nhưng không có thay đổi
    }
  }

  // Lấy lại profile đã cập nhật để trả về
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

  // 1. Xóa avatar cũ trên Cloudinary nếu có
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
      // Không nên chặn việc upload avatar mới nếu xóa avatar cũ thất bại, chỉ log lỗi
      logger.error(
        `Failed to delete old avatar ${userProfile.AvatarPublicId} from Cloudinary:`,
        deleteError
      );
    }
  }

  // 2. Upload avatar mới lên Cloudinary
  let uploadResult;
  try {
    const options = {
      folder: `users/${accountId}/avatars`, // Tổ chức file trên Cloudinary
      resource_type: 'image',
      // Có thể thêm các transformation (ví dụ: crop, resize) ở đây nếu muốn
      // transformation: [{ width: 200, height: 200, crop: 'fill', gravity: 'face' }]
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

  // 3. Cập nhật thông tin AvatarUrl và AvatarPublicId trong UserProfiles
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
      // Điều này không nên xảy ra nếu userProfile đã được tìm thấy ở trên
      throw new Error('Failed to update user profile in DB.');
    }
  } catch (dbError) {
    logger.error(
      `Failed to update user profile for ${accountId} in DB after avatar upload. Uploaded public_id: ${uploadResult.public_id}. DB Error:`,
      dbError
    );
    // Rollback: Xóa file vừa upload lên Cloudinary nếu cập nhật DB thất bại
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

  // 4. Lấy lại thông tin profile đã cập nhật để trả về
  const updatedProfile = await userRepository.findUserProfileById(accountId);
  return toCamelCaseObject(updatedProfile); // Chuyển đổi sang camelCase nếu cần
};

// --- Các hàm cho Admin ---

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
    users: result.users,
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
  const user = await userRepository.findUserProfileById(userId); // Dùng hàm lấy profile chi tiết
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
  // Có thể thêm logic kiểm tra không cho phép ban/inactive SuperAdmin ở đây

  const rowsAffected = await authRepository.updateAccountById(userId, {
    Status: status,
  });
  if (rowsAffected === 0) {
    logger.warn(`Update status for ${userId} to ${status} affected 0 rows.`);
    // Không cần throw lỗi nếu user tồn tại nhưng status không đổi
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
  // Có thể thêm logic kiểm tra không cho phép thay đổi role của SuperAdmin

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
  // Admin functions
  getUsers,
  getUserById,
  updateUserStatus,
  updateUserRole,
};
