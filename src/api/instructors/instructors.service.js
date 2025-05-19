const httpStatus = require('http-status').status;
const instructorRepository = require('./instructors.repository');
const userRepository = require('../users/users.repository');
const skillsRepository = require('../skills/skills.repository');
const ApiError = require('../../core/errors/ApiError');
const Roles = require('../../core/enums/Roles');
const payoutMethodRepository = require('./payoutMethod.repository');
const paymentMethodRepository = require('../payments/paymentMethod.repository');
const balanceTransactionRepository = require('../financials/balanceTransaction.repository'); // Import
const payoutRepository = require('../financials/payout.repository'); // Import
const enrollmentRepository = require('../enrollments/enrollments.repository'); // Import
const Currency = require('../../core/enums/Currency'); // Import
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
  // Lấy cả UserProfile và InstructorProfile
  const userProfile = await userRepository.findUserProfileById(accountId);
  if (!userProfile || userProfile.RoleID !== Roles.INSTRUCTOR) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Bạn không phải là giảng viên.');
  }
  const instructorProfile =
    await instructorRepository.findOrCreateInstructorProfile(accountId);

  // Lấy skills và social links
  const skills = await instructorRepository.findInstructorSkills(accountId);
  const socialLinks =
    await instructorRepository.findInstructorSocialLinks(accountId);

  // Kết hợp thông tin
  return {
    ...userProfile, // Thông tin chung (FullName, Avatar, Email,...)
    ...instructorProfile, // Thông tin riêng (Bio, Title, Bank Info,...) - Có thể trùng AccountID, CreatedAt, UpdatedAt
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
  const instructorFields = ['professionalTitle', 'bio', 'aboutMe']; // Chỉ còn các trường này
  instructorFields.forEach((field) => {
    let dbField = field.charAt(0).toUpperCase() + field.slice(1);
    if (field === 'professionalTitle') dbField = 'ProfessionalTitle';
    if (field === 'bio') dbField = 'Bio';
    if (field === 'aboutMe') dbField = 'AboutMe';

    if (updateBody[field] !== undefined) {
      instructorProfileUpdates[dbField] = updateBody[field];
    }
  });
  // TODO: Validate bank info nếu cần (ví dụ: độ dài số TK)

  // Cập nhật UserProfile (nếu có)
  // if (Object.keys(userProfileUpdates).length > 0) {
  //     await userRepository.updateUserProfileById(accountId, userProfileUpdates);
  // }

  // Cập nhật InstructorProfile
  if (Object.keys(instructorProfileUpdates).length > 0) {
    await instructorRepository.updateInstructorProfile(
      accountId,
      instructorProfileUpdates
    );
  }

  // Lấy lại profile đầy đủ sau khi cập nhật
  return getMyInstructorProfile(accountId);
};

/**
 * Instructor thêm kỹ năng vào hồ sơ.
 * @param {number} accountId
 * @param {number} skillId
 * @returns {Promise<object>} - Danh sách kỹ năng mới.
 */
const addMySkill = async (accountId, skillId) => {
  // Kiểm tra skill tồn tại
  const skill = await skillsRepository.findSkillById(skillId);
  if (!skill) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Kỹ năng không tồn tại.');
  }
  // Repo sẽ xử lý lỗi trùng lặp
  await instructorRepository.addInstructorSkill(accountId, skillId);
  // Trả về danh sách kỹ năng mới
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
  if (deletedCount === 0) {
    // Không báo lỗi nếu cố xóa skill không có? Hoặc báo lỗi?
    // throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy kỹ năng này trong hồ sơ của bạn.');
  }
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
  // Validate URL?
  // Validate Platform? (có thể tạo enum)
  await instructorRepository.createOrUpdateSocialLink(
    accountId,
    platform.toUpperCase(),
    url
  ); // Luôn lưu platform dạng uppercase
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
  // Có thể tính toán thêm số liệu (rating, student count) ở đây
  // profile.totalStudents = await ...
  // profile.averageRating = await ...
  return toCamelCaseObject(profile);
};

// /**
//  * Instructor cập nhật thông tin tài khoản ngân hàng.
//  * @param {number} accountId
//  * @param {object} bankInfo - { bankAccountNumber, bankName, bankAccountHolderName }
//  * @returns {Promise<{BankAccountNumber: string, BankName: string, BankAccountHolderName: string}>} - Thông tin bank đã cập nhật.
//  */
// const updateMyBankInfo = async (accountId, bankInfo) => {
//   // Validate đầu vào (độ dài, ký tự đặc biệt...) nếu cần
//   const { bankAccountNumber, bankName, bankAccountHolderName } = bankInfo;
//   if (!bankAccountNumber || !bankName || !bankAccountHolderName) {
//     throw new ApiError(
//       httpStatus.BAD_REQUEST,
//       'Vui lòng cung cấp đầy đủ thông tin tài khoản ngân hàng.'
//     );
//   }

//   const updateData = {
//     BankAccountNumber: bankAccountNumber,
//     BankName: bankName,
//     BankAccountHolderName: bankAccountHolderName,
//   };

//   await instructorRepository.updateInstructorProfile(accountId, updateData);

//   // Lấy lại thông tin bank đã cập nhật
//   const updatedBankInfo =
//     await instructorRepository.getInstructorBankInfo(accountId);
//   return updatedBankInfo;
// };

// --- Payout Method Management ---

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

    // Che số tài khoản ngân hàng
    if (
      m.MethodID === PaymentMethod.BANK_TRANSFER &&
      parsedDetails.bankAccountNumber
    ) {
      const accNum = parsedDetails.bankAccountNumber.toString();
      parsedDetails.bankAccountNumberLast4 =
        accNum.length > 4 ? accNum.slice(-4) : accNum;
      delete parsedDetails.bankAccountNumber; // Xóa số đầy đủ
    }

    return {
      payoutMethodId: m.PayoutMethodID,
      methodId: m.MethodID,
      methodName: m.MethodName, // Từ join trong repo
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

  // Validate cấu trúc 'newDetails' dựa trên existingMethod.MethodID
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
    // Validate thêm nếu cần
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

  // Kiểm tra MethodID hợp lệ
  const paymentMethod = await paymentMethodRepository.findMethodById(methodId); // Cần tạo hàm này
  if (!paymentMethod) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Phương thức thanh toán không hợp lệ.'
    );
  }

  // Validate cấu trúc 'details' dựa trên methodId (QUAN TRỌNG)
  // Ví dụ: Nếu là BANK_TRANSFER, details phải có bankAccountNumber, bankName,...
  // Nếu là PAYPAL, details phải có email.
  // --> Thêm logic validation ở đây
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
    // Có thể validate thêm định dạng số tài khoản,...
  } else if (methodId === 'PAYPAL') {
    if (!details || !details.email || !/\S+@\S+\.\S+/.test(details.email)) {
      // Check email đơn giản
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Cần cung cấp email PayPal hợp lệ.'
      );
    }
  } // Thêm các phương thức khác...

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // Nếu đặt làm primary, bỏ primary cũ trước
    if (isPrimary) {
      await payoutMethodRepository.setPrimaryPayoutMethod(
        accountId,
        0,
        transaction
      ); // Truyền ID 0 để bỏ hết primary cũ
    }

    const newMethodData = {
      AccountID: accountId,
      MethodID: methodId,
      Details: JSON.stringify(details), // Lưu dạng JSON string
      IsPrimary: !!isPrimary, // Chuyển thành boolean
      Status: 'ACTIVE', // Hoặc REQUIRES_VERIFICATION tùy logic
    };
    await payoutMethodRepository.addPayoutMethod(newMethodData, transaction); // Thêm vào DB

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

  // Trả về danh sách mới
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

  // Kiểm tra xem phương thức có tồn tại và thuộc về user không
  const existingMethod =
    await payoutMethodRepository.findPayoutMethodById(payoutMethodId);
  if (!existingMethod || existingMethod.AccountID !== accountId) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Không tìm thấy phương thức thanh toán.'
    );
  }

  // Validate details nếu được cung cấp
  if (details) {
    // Validate cấu trúc 'details' dựa trên existingMethod.MethodID
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
      // Có thể thêm logic kiểm tra định dạng số tài khoản, tên ngân hàng, v.v.
    } else if (existingMethod.MethodID === 'PAYPAL') {
      if (!details.email || !/\S+@\S+\.\S+/.test(details.email)) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Cần cung cấp email PayPal hợp lệ.'
        );
      }
    } else {
      // Thêm các phương thức khác nếu cần
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Phương thức thanh toán không được hỗ trợ.'
      );
    }
  }

  // Validate status nếu được cung cấp
  if (status && !['ACTIVE', 'INACTIVE'].includes(status)) {
    // User chỉ có thể đặt active/inactive?
    throw new ApiError(httpStatus.BAD_REQUEST, 'Trạng thái không hợp lệ.');
  }

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // Nếu đặt làm primary, xử lý primary cũ/mới
    if (isPrimary === true && !existingMethod.IsPrimary) {
      await payoutMethodRepository.setPrimaryPayoutMethod(
        accountId,
        payoutMethodId,
        transaction
      );
    } else if (isPrimary === false && existingMethod.IsPrimary) {
      // Không cho phép bỏ primary nếu đây là cái duy nhất? Hoặc tự động chọn cái khác?
      // Tạm thời cho phép bỏ primary
      // Nếu cần logic phức tạp hơn (ví dụ: phải có ít nhất 1 primary), xử lý ở đây
    }

    const updateData = {};
    if (details) updateData.Details = JSON.stringify(details);
    if (status) updateData.Status = status;
    // IsPrimary đã được xử lý riêng bởi setPrimaryPayoutMethod nếu isPrimary=true
    // Chỉ cập nhật IsPrimary thành false nếu user yêu cầu và nó đang là true
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
  // Kiểm tra phương thức tồn tại và thuộc về user
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

  return getMyPayoutMethods(accountId);
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
  // Không cho xóa phương thức chính?
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
  // Giả sử repository sẽ trả về đúng cấu trúc InstructorListResponse
  const result = await instructorRepository.findAllInstructors(
    filterOptions,
    paginationOptions
  );
  return toCamelCaseObject(result);
};

// /**
//  * Get instructor by slug or ID.
//  * @param {string | number} identifier
//  * @returns {Promise<InstructorListItem | null>}
//  */
// const getInstructorBySlugOrId = async (identifier) => {
//   const instructor = await instructorRepository.findInstructorBySlugOrId(identifier);
//   return instructor;
// };

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
      currentBalance: parseFloat(currentBalance.toString()), // Đảm bảo là số
      totalLifetimeEarnings: parseFloat(totalLifetimeEarnings.toString()),
      pendingPayoutsAmount: parseFloat(pendingPayoutsAmount.toString()),
      totalStudentsLifetime,
      currencyId: Currency.VND, // Giả sử VND là tiền tệ chính
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

  // Payout Methods
  getMyPayoutMethods,
  updateMyPayoutMethodDetails,
  addMyPayoutMethod,
  updateMyPayoutMethod,
  setMyPrimaryPayoutMethod,
  deleteMyPayoutMethod,
  queryInstructors,
  // getInstructorBySlugOrId,
  getStudentsOfInstructor,
  getMyFinancialOverview,
};
