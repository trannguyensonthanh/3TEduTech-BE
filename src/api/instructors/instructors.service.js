const httpStatus = require('http-status').status;
const instructorRepository = require('./instructors.repository');
const userRepository = require('../users/users.repository');
const skillsRepository = require('../skills/skills.repository');
const ApiError = require('../../core/errors/ApiError');
const Roles = require('../../core/enums/Roles');
const payoutMethodRepository = require('./payoutMethod.repository');
const paymentMethodRepository = require('../payments/paymentMethod.repository');
const balanceTransactionRepository = require('../financials/balanceTransaction.repository');
const payoutRepository = require('../financials/payout.repository');
const enrollmentRepository = require('../enrollments/enrollments.repository');
const Currency = require('../../core/enums/Currency');
const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');
const { toCamelCaseObject } = require('../../utils/caseConverter');
const PaymentMethod = require('../../core/enums/PaymentMethod');

/**
 * Instructor lấy thông tin hồ sơ của mình (bao gồm cả phần private).
 * @param {number} accountId
 * @returns {Promise<object>}
 */
const getMyInstructorProfile = async (accountId) => {
  const userProfile = await userRepository.findUserProfileById(accountId);
  if (!userProfile || userProfile.RoleID !== Roles.INSTRUCTOR) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Bạn không phải là giảng viên.');
  }
  const instructorProfile =
    await instructorRepository.findOrCreateInstructorProfile(accountId);

  const skills = await instructorRepository.findInstructorSkills(accountId);
  const socialLinks =
    await instructorRepository.findInstructorSocialLinks(accountId);

  return {
    ...userProfile,
    ...instructorProfile,
    skills,
    socialLinks,
  };
};

/**
 * Instructor cập nhật hồ sơ chuyên nghiệp.
 * @param {number} accountId
 * @param {object} updateBody - { professionalTitle, bio, aboutMe, bankAccountNumber, bankName, bankAccountHolderName }
 * @returns {Promise<object>} - Profile đã cập nhật.
 */
const updateMyInstructorProfile = async (accountId, updateBody) => {
  const instructorProfileUpdates = {};
  const instructorFields = ['professionalTitle', 'bio', 'aboutMe'];
  instructorFields.forEach((field) => {
    let dbField = field.charAt(0).toUpperCase() + field.slice(1);
    if (field === 'professionalTitle') dbField = 'ProfessionalTitle';
    if (field === 'bio') dbField = 'Bio';
    if (field === 'aboutMe') dbField = 'AboutMe';

    if (updateBody[field] !== undefined) {
      instructorProfileUpdates[dbField] = updateBody[field];
    }
  });

  if (Object.keys(instructorProfileUpdates).length > 0) {
    await instructorRepository.updateInstructorProfile(
      accountId,
      instructorProfileUpdates
    );
  }

  return getMyInstructorProfile(accountId);
};

/**
 * Instructor thêm kỹ năng vào hồ sơ.
 * @param {number} accountId
 * @param {number} skillId
 * @returns {Promise<object>} - Danh sách kỹ năng mới.
 */
const addMySkill = async (accountId, skillId) => {
  const skill = await skillsRepository.findSkillById(skillId);
  if (!skill) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Kỹ năng không tồn tại.');
  }
  await instructorRepository.addInstructorSkill(accountId, skillId);
  return instructorRepository.findInstructorSkills(accountId);
};

/**
 * Instructor xóa kỹ năng khỏi hồ sơ.
 * @param {number} accountId
 * @param {number} skillId
 * @returns {Promise<object>} - Danh sách kỹ năng còn lại.
 */
const removeMySkill = async (accountId, skillId) => {
  const deletedCount = await instructorRepository.removeInstructorSkill(
    accountId,
    skillId
  );
  return instructorRepository.findInstructorSkills(accountId);
};

/**
 * Instructor thêm hoặc cập nhật liên kết mạng xã hội.
 * @param {number} accountId
 * @param {string} platform - Ví dụ: 'LINKEDIN', 'GITHUB', 'WEBSITE', 'YOUTUBE'
 * @param {string} url
 * @returns {Promise<object>} - Danh sách social links mới.
 */
const addOrUpdateMySocialLink = async (accountId, platform, url) => {
  await instructorRepository.createOrUpdateSocialLink(
    accountId,
    platform.toUpperCase(),
    url
  );
  return instructorRepository.findInstructorSocialLinks(accountId);
};

/**
 * Instructor xóa liên kết mạng xã hội.
 * @param {number} accountId
 * @param {string} platform
 * @returns {Promise<object>} - Danh sách social links còn lại.
 */
const removeMySocialLink = async (accountId, platform) => {
  await instructorRepository.removeSocialLink(
    accountId,
    platform.toUpperCase()
  );
  return instructorRepository.findInstructorSocialLinks(accountId);
};

/**
 * Lấy thông tin công khai của một giảng viên.
 * @param {number} instructorId
 * @returns {Promise<object>}
 */
const getInstructorPublicProfile = async (instructorId) => {
  logger.info(instructorId);
  const profile =
    await instructorRepository.findInstructorPublicProfile(instructorId);
  if (!profile) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Không tìm thấy thông tin giảng viên.'
    );
  }
  return toCamelCaseObject(profile);
};

/**
 * Instructor lấy danh sách phương thức thanh toán đã lưu.
 * @param {number} accountId
 * @returns {Promise<Array<object>>}
 */
const getMyPayoutMethods = async (accountId) => {
  const methods =
    await payoutMethodRepository.findPayoutMethodsByAccountId(accountId);
  return methods.map((m) => {
    let parsedDetails;
    try {
      parsedDetails = JSON.parse(m.Details);
    } catch (e) {
      parsedDetails = { error: 'Invalid JSON details' };
    }

    if (
      m.MethodID === PaymentMethod.BANK_TRANSFER &&
      parsedDetails.bankAccountNumber
    ) {
      const accNum = parsedDetails.bankAccountNumber.toString();
      parsedDetails.bankAccountNumberLast4 =
        accNum.length > 4 ? accNum.slice(-4) : accNum;
      delete parsedDetails.bankAccountNumber;
    }

    return {
      payoutMethodId: m.PayoutMethodID,
      methodId: m.MethodID,
      methodName: m.MethodName,
      details: parsedDetails,
      isPrimary: m.IsPrimary,
      status: m.Status,
      createdAt: m.CreatedAt,
      updatedAt: m.UpdatedAt,
    };
  });
};

/**
 * Instructor cập nhật chi tiết của một phương thức thanh toán đã lưu.
 * @param {number} accountId
 * @param {number} payoutMethodId - PK của InstructorPayoutMethods
 * @param {object} newDetails - Object chứa thông tin chi tiết mới.
 * @returns {Promise<object>} - Danh sách phương thức mới.
 */
const updateMyPayoutMethodDetails = async (
  accountId,
  payoutMethodId,
  newDetails
) => {
  const existingMethod =
    await payoutMethodRepository.findPayoutMethodById(payoutMethodId);
  if (!existingMethod || existingMethod.AccountID !== accountId) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Không tìm thấy phương thức thanh toán hoặc bạn không có quyền sửa.'
    );
  }

  if (existingMethod.MethodID === PaymentMethod.BANK_TRANSFER) {
    if (
      !newDetails ||
      !newDetails.bankAccountNumber ||
      !newDetails.bankName ||
      !newDetails.bankAccountHolderName
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Thiếu thông tin tài khoản ngân hàng.'
      );
    }
  } else if (existingMethod.MethodID === PaymentMethod.PAYPAL) {
    if (
      !newDetails ||
      !newDetails.email ||
      !/\S+@\S+\.\S+/.test(newDetails.email)
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Cần cung cấp email PayPal hợp lệ.'
      );
    }
  } else {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Loại phương thức không hỗ trợ cập nhật chi tiết này.'
    );
  }

  await payoutMethodRepository.updatePayoutMethod(payoutMethodId, {
    Details: JSON.stringify(newDetails),
  });
  return getMyPayoutMethods(accountId);
};

/**
 * Instructor thêm phương thức thanh toán mới.
 * @param {number} accountId
 * @param {object} data - { methodId, details (object), isPrimary }
 * @returns {Promise<object>} - Danh sách phương thức mới.
 */
const addMyPayoutMethod = async (accountId, data) => {
  const { methodId, details, isPrimary } = data;

  const paymentMethod = await paymentMethodRepository.findMethodById(methodId);
  if (!paymentMethod) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Phương thức thanh toán không hợp lệ.'
    );
  }

  if (methodId === 'BANK_TRANSFER') {
    if (
      !details ||
      !details.bankAccountNumber ||
      !details.bankName ||
      !details.bankAccountHolderName
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Thiếu thông tin tài khoản ngân hàng.'
      );
    }
  } else if (methodId === 'PAYPAL') {
    if (!details || !details.email || !/\S+@\S+\.\S+/.test(details.email)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Cần cung cấp email PayPal hợp lệ.'
      );
    }
  }

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    if (isPrimary) {
      await payoutMethodRepository.setPrimaryPayoutMethod(
        accountId,
        0,
        transaction
      );
    }

    const newMethodData = {
      AccountID: accountId,
      MethodID: methodId,
      Details: JSON.stringify(details),
      IsPrimary: !!isPrimary,
      Status: 'ACTIVE',
    };
    await payoutMethodRepository.addPayoutMethod(newMethodData, transaction);

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    logger.error(`Error adding payout method for user ${accountId}:`, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Thêm phương thức thanh toán thất bại.'
    );
  }

  return getMyPayoutMethods(accountId);
};

/**
 * Instructor cập nhật phương thức thanh toán.
 * @param {number} accountId
 * @param {number} payoutMethodId
 * @param {object} data - { details?, status?, isPrimary? }
 * @returns {Promise<object>} - Danh sách phương thức mới.
 */
const updateMyPayoutMethod = async (accountId, payoutMethodId, data) => {
  const { details, status, isPrimary } = data;

  const existingMethod =
    await payoutMethodRepository.findPayoutMethodById(payoutMethodId);
  if (!existingMethod || existingMethod.AccountID !== accountId) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Không tìm thấy phương thức thanh toán.'
    );
  }

  if (details) {
    if (existingMethod.MethodID === 'BANK_TRANSFER') {
      if (
        !details.bankAccountNumber ||
        !details.bankName ||
        !details.bankAccountHolderName
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Thiếu thông tin tài khoản ngân hàng.'
        );
      }
    } else if (existingMethod.MethodID === 'PAYPAL') {
      if (!details.email || !/\S+@\S+\.\S+/.test(details.email)) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Cần cung cấp email PayPal hợp lệ.'
        );
      }
    } else {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Phương thức thanh toán không được hỗ trợ.'
      );
    }
  }

  if (status && !['ACTIVE', 'INACTIVE'].includes(status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Trạng thái không hợp lệ.');
  }

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    if (isPrimary === true && !existingMethod.IsPrimary) {
      await payoutMethodRepository.setPrimaryPayoutMethod(
        accountId,
        payoutMethodId,
        transaction
      );
    } else if (isPrimary === false && existingMethod.IsPrimary) {
      //
    }

    const updateData = {};
    if (details) updateData.Details = JSON.stringify(details);
    if (status) updateData.Status = status;
    if (isPrimary === false && existingMethod.IsPrimary) {
      updateData.IsPrimary = false;
    }

    if (Object.keys(updateData).length > 0) {
      await payoutMethodRepository.updatePayoutMethod(
        payoutMethodId,
        updateData,
        transaction
      );
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    logger.error(
      `Error updating payout method ${payoutMethodId} for user ${accountId}:`,
      error
    );
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Cập nhật phương thức thanh toán thất bại.'
    );
  }

  return getMyPayoutMethods(accountId);
};

/**
 * Instructor đặt phương thức làm chính.
 * @param {number} accountId
 * @param {number} payoutMethodId
 * @returns {Promise<object>} - Danh sách phương thức mới.
 */
const setMyPrimaryPayoutMethod = async (accountId, payoutMethodId) => {
  const method =
    await payoutMethodRepository.findPayoutMethodById(payoutMethodId);
  if (!method || method.AccountID !== accountId) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Không tìm thấy phương thức thanh toán.'
    );
  }
  if (method.Status !== 'ACTIVE') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Chỉ có thể đặt phương thức đang hoạt động làm chính.'
    );
  }

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    await payoutMethodRepository.setPrimaryPayoutMethod(
      accountId,
      payoutMethodId,
      transaction
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    logger.error(
      `Error setting primary payout method ${payoutMethodId} for user ${accountId}:`,
      error
    );
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Đặt phương thức chính thất bại.'
    );
  }

  const methods = await getMyPayoutMethods(accountId);
  return methods.find((m) => m.isPrimary === true) || null;
};

/**
 * Instructor xóa phương thức thanh toán.
 * @param {number} accountId
 * @param {number} payoutMethodId
 * @returns {Promise<object>} - Danh sách phương thức còn lại.
 */
const deleteMyPayoutMethod = async (accountId, payoutMethodId) => {
  const method =
    await payoutMethodRepository.findPayoutMethodById(payoutMethodId);
  if (!method || method.AccountID !== accountId) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Không tìm thấy phương thức thanh toán.'
    );
  }
  if (method.IsPrimary) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Không thể xóa phương thức thanh toán chính. Vui lòng đặt phương thức khác làm chính trước.'
    );
  }

  await payoutMethodRepository.deletePayoutMethodById(payoutMethodId);
  return getMyPayoutMethods(accountId);
};

/**
 * Query for instructors with pagination and filtering.
 * @param {object} filterOptions - Options for filtering instructors.
 * @param {object} paginationOptions - Options for pagination and sorting.
 * @returns {Promise<InstructorListResponse>}
 */
const queryInstructors = async (filterOptions, paginationOptions) => {
  const result = await instructorRepository.findAllInstructors(
    filterOptions,
    paginationOptions
  );
  return toCamelCaseObject(result);
};

const getStudentsOfInstructor = async (instructorId, options) => {
  const {
    page = 1,
    limit = 10,
    searchTerm = '',
    status,
    courseId,
    sortBy,
  } = options;
  console.log('getStudentsOfInstructor', instructorId, options);
  const result = await instructorRepository.findStudentsOfInstructor({
    instructorId,
    page,
    limit,
    searchTerm,
    status,
    courseId,
    sortBy,
  });

  return {
    students: toCamelCaseObject(result.students),
    total: result.total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalPages: Math.ceil(result.total / limit),
  };
};

/**
 * Lấy dữ liệu tổng quan tài chính cho dashboard của instructor.
 * @param {number} instructorId
 * @returns {Promise<InstructorFinancialOverviewResponse>}
 */
const getMyFinancialOverview = async (instructorId) => {
  try {
    const currentBalancePromise =
      balanceTransactionRepository.getCurrentBalance(instructorId);
    const totalLifetimeEarningsPromise =
      balanceTransactionRepository.getTotalLifetimeEarnings(instructorId);
    const pendingPayoutsAmountPromise =
      payoutRepository.getPendingPayoutsAmount(instructorId);
    const totalStudentsLifetimePromise =
      enrollmentRepository.countTotalUniqueStudentsForInstructor(instructorId);

    const [
      currentBalance,
      totalLifetimeEarnings,
      pendingPayoutsAmount,
      totalStudentsLifetime,
    ] = await Promise.all([
      currentBalancePromise,
      totalLifetimeEarningsPromise,
      pendingPayoutsAmountPromise,
      totalStudentsLifetimePromise,
    ]);

    return {
      currentBalance: parseFloat(currentBalance.toString()),
      totalLifetimeEarnings: parseFloat(totalLifetimeEarnings.toString()),
      pendingPayoutsAmount: parseFloat(pendingPayoutsAmount.toString()),
      minWithdrawalAmount: 100000,
      revenueSharePercentage: 0.7,
      totalStudentsLifetime,
      currencyId: Currency.VND,
    };
  } catch (error) {
    logger.error(
      `Error fetching financial overview for instructor ${instructorId}:`,
      error
    );
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Không thể tải dữ liệu tổng quan tài chính.'
    );
  }
};

module.exports = {
  getMyInstructorProfile,
  updateMyInstructorProfile,
  addMySkill,
  removeMySkill,
  addOrUpdateMySocialLink,
  removeMySocialLink,
  getInstructorPublicProfile,
  getMyPayoutMethods,
  updateMyPayoutMethodDetails,
  addMyPayoutMethod,
  updateMyPayoutMethod,
  setMyPrimaryPayoutMethod,
  deleteMyPayoutMethod,
  queryInstructors,
  getStudentsOfInstructor,
  getMyFinancialOverview,
};
