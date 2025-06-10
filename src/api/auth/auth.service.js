// Đường dẫn: src/api/auth/auth.service.js
// eslint-disable-next-line no-restricted-syntax
// eslint-disable-next-line no-await-in-loop

const axios = require('axios');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const httpStatus = require('http-status').status;
const moment = require('moment');
const { getConnection, sql } = require('../../database/connection');
const authRepository = require('./auth.repository');
const userRepository = require('../users/users.repository'); // Cần để tạo profile
const accountRepository = require('./auth.repository'); // Sử dụng accountRepository
const { hashPassword, comparePassword } = require('../../utils/hashPassword');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  generateRandomToken,
  calculateTokenExpiration,
} = require('../../utils/generateToken');

const jwtConfig = require('../../config/jwt');
const ApiError = require('../../core/errors/ApiError');
const logger = require('../../utils/logger');
const skillsRepository = require('../skills/skills.repository'); // *** Import repo skills ***
const instructorRepository = require('../instructors/instructors.repository'); // *** Import repo instructors ***
const AccountStatus = require('../../core/enums/AccountStatus');
const Roles = require('../../core/enums/Roles');
const LoginType = require('../../core/enums/LoginType');
const emailSender = require('../../utils/emailSender'); // Sẽ dùng sau
const config = require('../../config');

let googleClient = null;
if (config.googleAuth.clientID) {
  googleClient = new OAuth2Client(config.googleAuth.clientID);
  logger.info('Google OAuth2Client initialized.');
} else {
  logger.warn('Google ClientID not configured, Google login might fail.');
}
/**
 * Đăng ký người dùng mới (Email/Password).
 * @param {object} userData - { email, password, fullName, roleId (optional, default STUDENT) }.
 * @returns {Promise<object>} - Đối tượng người dùng mới (không bao gồm password).
 */
const register = async (userData) => {
  const { email, password, fullName, roleId = Roles.STUDENT } = userData;

  // 1. Kiểm tra email tồn tại
  const existingAccount = await authRepository.findAccountByEmail(email);
  if (existingAccount) {
    if (existingAccount.Status === AccountStatus.PENDING_VERIFICATION) {
      // Nếu email đang ở trạng thái PENDING_VERIFICATION, cập nhật lại thời gian xác thực
      const verificationToken = generateRandomToken();
      const verificationExpires = calculateTokenExpiration(
        jwtConfig.emailVerificationTokenExpiresMinutes
      );

      await authRepository.updateAccountById(existingAccount.AccountID, {
        EmailVerificationToken: verificationToken,
        EmailVerificationExpires: verificationExpires,
      });

      // Gửi lại email xác thực
      try {
        await emailSender.sendVerificationEmail(
          email,
          fullName || 'bạn',
          verificationToken
        );
        logger.info(`Verification email resent to ${email}`);
      } catch (emailError) {
        logger.error(
          `Failed to resend verification email to ${email}:`,
          emailError
        );
      }

      // Báo cho người dùng rằng email đã được gửi
      return {
        message:
          'Email đã tồn tại nhưng chưa được xác thực. Vui lòng kiểm tra email để xác thực tài khoản.',
      };
    }

    // Nếu email đã tồn tại và không ở trạng thái PENDING_VERIFICATION
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email đã được sử dụng.');
  }

  // 2. Hash mật khẩu
  const hashedPassword = await hashPassword(password);

  // 3. Chuẩn bị dữ liệu và token xác thực
  const verificationToken = generateRandomToken();
  const verificationExpires = calculateTokenExpiration(
    jwtConfig.emailVerificationTokenExpiresMinutes
  );

  // 4. Bắt đầu transaction
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // 5. Tạo Account
    const accountData = {
      Email: email,
      HashedPassword: hashedPassword,
      RoleID: roleId,
      Status: AccountStatus.PENDING_VERIFICATION,
      EmailVerificationToken: verificationToken,
      EmailVerificationExpires: verificationExpires,
      HasSocialLogin: false,
    };
    const newAccount = await authRepository.createAccountInTransaction(
      accountData,
      transaction
    );
    const accountId = newAccount.AccountID;

    // 6. Tạo UserProfile
    const profileData = {
      AccountID: accountId,
      FullName: fullName,
    };
    await userRepository.createUserProfileInTransaction(
      profileData,
      transaction
    );

    // 7. Tạo AuthMethod (EMAIL)
    const authMethodData = {
      AccountID: accountId,
      LoginType: LoginType.EMAIL,
      ExternalID: null,
    };
    await authRepository.createAuthMethodInTransaction(
      authMethodData,
      transaction
    );

    // 8. Commit transaction
    await transaction.commit();

    // 9. Gửi email xác thực
    try {
      await emailSender.sendVerificationEmail(
        email,
        fullName || 'bạn',
        verificationToken
      );
      logger.info(`Verification email sent to ${email}`);
    } catch (emailError) {
      logger.error(
        `Failed to send verification email to ${email}:`,
        emailError
      );
    }

    // 10. Trả về thông báo cho người dùng
    return {
      message:
        'Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản.',
    };
  } catch (error) {
    logger.error('Error during registration transaction:', error);
    await transaction.rollback();
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Đăng ký thất bại, vui lòng thử lại.'
    );
  }
};
/**
 * Đăng nhập bằng Email/Password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{accessToken: string, refreshToken: string, user: object}>}
 */
const login = async (email, password) => {
  const account = await authRepository.findAccountByEmail(email);
  if (!account) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'Email hoặc mật khẩu không chính xác.'
    );
  }

  if (account.Status === AccountStatus.PENDING_VERIFICATION) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'Tài khoản chưa được xác thực. Vui lòng kiểm tra email.'
    );
  }

  if (
    account.Status === AccountStatus.BANNED ||
    account.Status === AccountStatus.INACTIVE
  ) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'Tài khoản đã bị khóa hoặc không hoạt động.'
    );
  }

  // Kiểm tra nếu tài khoản chỉ có social login và không có password
  if (account.HasSocialLogin && !account.HashedPassword) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Vui lòng đăng nhập bằng phương thức mạng xã hội đã liên kết.'
    );
  }

  const isPasswordMatch = await comparePassword(
    password,
    account.HashedPassword
  );
  if (!isPasswordMatch) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'Email hoặc mật khẩu không chính xác.'
    );
  }

  // Tạo tokens
  const payload = { accountId: account.AccountID, role: account.RoleID };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken({ accountId: account.AccountID }); // Refresh token thường chỉ cần ID

  // Lấy thông tin profile để trả về
  const userProfile = await userRepository.findUserProfileById(
    account.AccountID
  );

  return {
    accessToken,
    refreshToken,
    user: {
      // Chỉ trả về thông tin cần thiết cho client
      id: userProfile.AccountID,
      email: userProfile.Email,
      fullName: userProfile.FullName,
      avatarUrl: userProfile.AvatarUrl,
      role: userProfile.RoleID,
      status: userProfile.Status,
    },
  };
};

/**
 * Làm mới access token bằng refresh token.
 * @param {string} providedRefreshToken
 * @returns {Promise<{accessToken: string}>}
 */
const refreshAuth = async (providedRefreshToken) => {
  const payload = await verifyToken(providedRefreshToken);
  if (!payload || !payload.accountId) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'Refresh token không hợp lệ hoặc đã hết hạn.'
    );
  }

  const account = await authRepository.findAccountById(payload.accountId);
  if (!account || account.Status !== AccountStatus.ACTIVE) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'Người dùng không tồn tại hoặc không hoạt động.'
    );
  }

  // Tạo access token mới
  const newAccessToken = generateAccessToken({
    accountId: account.AccountID,
    role: account.RoleID,
  });

  return { accessToken: newAccessToken };
};

/**
 * Xác thực email bằng token.
 * @param {string} verificationToken
 * @returns {Promise<void>}
 */
const verifyEmail = async (verificationToken) => {
  const account =
    await authRepository.findAccountByVerificationToken(verificationToken);

  if (!account) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Token xác thực không hợp lệ.');
  }

  if (moment().isAfter(account.EmailVerificationExpires)) {
    // TODO: Cân nhắc cho phép gửi lại email xác thực ở đây
    throw new ApiError(httpStatus.BAD_REQUEST, 'Token xác thực đã hết hạn.');
  }

  if (account.Status === AccountStatus.ACTIVE) {
    // Đã xác thực rồi, không cần làm gì thêm, hoặc có thể báo lỗi nhẹ nhàng
    logger.info(`Account ${account.AccountID} is already verified.`);
    // Có thể clear token nếu muốn
    // await authRepository.updateAccountById(account.AccountID, {
    //     EmailVerificationToken: null,
    //     EmailVerificationExpires: null,
    // });
    return; // Kết thúc sớm
  }

  // Cập nhật trạng thái và xóa token
  await authRepository.updateAccountById(account.AccountID, {
    Status: AccountStatus.ACTIVE,
    EmailVerificationToken: null,
    EmailVerificationExpires: null,
  });
  logger.info(`Account ${account.AccountID} verified successfully.`);
};

/**
 * Yêu cầu reset mật khẩu.
 * @param {string} email
 * @returns {Promise<void>}
 */
const requestPasswordReset = async (email) => {
  const account = await authRepository.findAccountByEmail(email);
  if (!account) {
    // Không báo lỗi cụ thể để tránh lộ thông tin email có tồn tại hay không
    logger.warn(`Password reset requested for non-existent email: ${email}`);
    return; // Kết thúc âm thầm
  }
  if (account.Status !== AccountStatus.ACTIVE) {
    logger.warn(
      `Password reset requested for inactive/banned account: ${email} (${account.Status})`
    );
    return; // Không cho reset nếu tài khoản không active
  }

  const resetToken = generateRandomToken();
  const resetExpires = calculateTokenExpiration(
    jwtConfig.passwordResetTokenExpiresMinutes
  );

  await authRepository.updateAccountById(account.AccountID, {
    PasswordResetToken: resetToken,
    PasswordResetExpires: resetExpires,
  });

  // Gửi email reset password (Tạm thời comment out)
  try {
    // Cần lấy fullName để cá nhân hóa email
    const userProfile = await userRepository.findUserProfileById(
      account.AccountID
    );
    await emailSender.sendPasswordResetEmail(
      email,
      userProfile?.FullName || 'bạn',
      resetToken
    );
    logger.info(`Password reset email sent to ${email}`);
  } catch (emailError) {
    logger.error(
      `Failed to send password reset email to ${email}:`,
      emailError
    );
    // Có thể throw lỗi ở đây để báo cho người dùng biết email không gửi được
    // Hoặc chỉ log và vẫn trả về thông báo thành công chung chung cho controller
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Không thể gửi email đặt lại mật khẩu lúc này.'
    );
  }
  logger.info(
    `Password reset requested for ${email}. Token generated (for debugging): ${resetToken}`
  );
};

/**
 * Reset mật khẩu bằng token.
 * @param {string} resetToken
 * @param {string} newPassword
 * @returns {Promise<void>}
 */
const resetPassword = async (resetToken, newPassword) => {
  const account =
    await authRepository.findAccountByPasswordResetToken(resetToken);

  if (!account) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Token reset mật khẩu không hợp lệ.'
    );
  }

  if (moment().isAfter(account.PasswordResetExpires)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Token reset mật khẩu đã hết hạn.'
    );
  }

  if (account.Status !== AccountStatus.ACTIVE) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Tài khoản không hoạt động.');
  }

  const hashedNewPassword = await hashPassword(newPassword);

  await authRepository.updateAccountById(account.AccountID, {
    HashedPassword: hashedNewPassword,
    PasswordResetToken: null, // Xóa token sau khi sử dụng
    PasswordResetExpires: null,
  });
  logger.info(`Password reset successfully for account ${account.AccountID}`);
};

/**
 * Đăng ký tài khoản Giảng viên mới.
 * @param {object} instructorData - Dữ liệu từ request body (đã validate).
 * @returns {Promise<object>} - Thông tin tài khoản cơ bản đã tạo.
 */
const registerInstructor = async (instructorData) => {
  const {
    email,
    password,
    fullName,
    professionalTitle,
    bio,
    skills = [], // Mảng skills (ID hoặc tên)
    socialLinks = [], // Mảng object { platform, url }
  } = instructorData;

  // 1. Kiểm tra email tồn tại
  const existingAccount = await authRepository.findAccountByEmail(email);
  if (existingAccount) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email đã được sử dụng.');
  }

  // 2. Hash mật khẩu
  const hashedPassword = await hashPassword(password);

  // 3. Chuẩn bị token xác thực email
  const verificationToken = generateRandomToken();
  const verificationExpires = calculateTokenExpiration(
    config.jwt.emailVerificationTokenExpiresMinutes
  );

  // 4. Bắt đầu Transaction
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // 5. Tạo Accounts
    const accountData = {
      Email: email,
      HashedPassword: hashedPassword,
      RoleID: Roles.INSTRUCTOR, // *** Gán vai trò GV ***
      Status: AccountStatus.PENDING_VERIFICATION, // *** Chờ xác thực email ***
      EmailVerificationToken: verificationToken,
      EmailVerificationExpires: verificationExpires,
      HasSocialLogin: false, // Đăng ký bằng email/pass
    };
    const newAccount = await authRepository.createAccountInTransaction(
      accountData,
      transaction
    );
    const accountId = newAccount.AccountID;

    // 6. Tạo UserProfiles
    const profileData = {
      AccountID: accountId,
      FullName: fullName,
      // Có thể thêm avatar mặc định nếu muốn
    };
    await userRepository.createUserProfileInTransaction(
      profileData,
      transaction
    );
    console.log('Transaction:', transaction); // Log dữ liệu profile để kiểm tra
    // 7. Tạo InstructorProfiles (nếu có thông tin)
    await instructorRepository.findOrCreateInstructorProfile(
      accountId,
      transaction
    ); // Đảm bảo record tồn tại
    const instructorProfileUpdates = {};
    if (professionalTitle)
      instructorProfileUpdates.ProfessionalTitle = professionalTitle;
    if (bio) instructorProfileUpdates.Bio = bio;
    if (Object.keys(instructorProfileUpdates).length > 0) {
      await instructorRepository.updateInstructorProfile(
        accountId,
        instructorProfileUpdates,
        transaction
      );
    }

    // 8. Xử lý và tạo InstructorSkills
    if (skills && skills.length > 0) {
      const skillIdsToAdd = [];
      // eslint-disable-next-line no-restricted-syntax
      for (const skillInput of skills) {
        let skillId;
        if (typeof skillInput === 'number') {
          // Nếu là ID, kiểm tra xem skill có tồn tại không

          const existingSkill =
            // eslint-disable-next-line no-await-in-loop
            await skillsRepository.findSkillById(skillInput);
          if (existingSkill) {
            skillId = existingSkill.SkillID;
          } else {
            logger.warn(
              `Skill ID ${skillInput} provided during instructor registration not found. Skipping.`
            );
          }
        } else if (typeof skillInput === 'string' && skillInput.trim()) {
          // Nếu là string, tìm hoặc tạo skill mới
          // eslint-disable-next-line no-await-in-loop
          const skill = await skillsRepository.findOrCreateSkill(
            skillInput.trim(),
            transaction
          );
          skillId = skill.SkillID;
        }
        if (skillId && !skillIdsToAdd.includes(skillId)) {
          skillIdsToAdd.push(skillId); // Tránh trùng lặp
        }
      }

      // Thêm các skill hợp lệ vào InstructorSkills
      // eslint-disable-next-line no-restricted-syntax
      for (const idToAdd of skillIdsToAdd) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await instructorRepository.addInstructorSkill(
            accountId,
            idToAdd,
            transaction
          );
        } catch (skillError) {
          // Bỏ qua lỗi unique nếu cố thêm skill đã có
          if (
            !(
              skillError instanceof ApiError &&
              skillError.statusCode === httpStatus.BAD_REQUEST
            )
          ) {
            throw skillError; // Ném lại lỗi khác
          }
        }
      }
    }

    // 9. Tạo InstructorSocialLinks
    if (socialLinks && socialLinks.length > 0) {
      // eslint-disable-next-line no-restricted-syntax
      for (const link of socialLinks) {
        // Repo dùng MERGE nên tự xử lý create/update
        // eslint-disable-next-line no-await-in-loop
        await instructorRepository.createOrUpdateSocialLink(
          accountId,
          link.platform,
          link.url,
          transaction
        );
      }
    }
    // 10. Tạo AuthMethods (EMAIL)
    const authMethodData = {
      AccountID: accountId,
      LoginType: LoginType.EMAIL,
      ExternalID: null,
    };
    await authRepository.createAuthMethodInTransaction(
      authMethodData,
      transaction
    );

    // 11. Commit transaction
    await transaction.commit();

    // 12. Gửi email xác thực
    try {
      await emailSender.sendVerificationEmail(
        email,
        fullName,
        verificationToken
      );
      logger.info(`Verification email sent to instructor ${email}`);
    } catch (emailError) {
      logger.error(
        `Failed to send verification email to instructor ${email}:`,
        emailError
      );
    }

    // 13. Trả về thông tin cơ bản
    const createdUser = await authRepository.findAccountById(accountId);
    return {
      accountId: createdUser.AccountID,
      email: createdUser.Email,
      role: createdUser.RoleID,
      status: createdUser.Status,
      message:
        'Đăng ký giảng viên thành công. Vui lòng kiểm tra email để xác thực tài khoản.',
    };
  } catch (error) {
    logger.error('Error during instructor registration transaction:', error);
    await transaction.rollback();
    if (error instanceof ApiError) throw error;
    if (error.number === 2627 || error.number === 2601) {
      // Lỗi unique chung (có thể từ email hoặc skill name mới)
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Email hoặc tên kỹ năng mới đã tồn tại.'
      );
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Đăng ký giảng viên thất bại.'
    );
  }
};

// --- Helper Function: Tìm hoặc tạo User khi đăng nhập Social ---
// Tái sử dụng logic từ các hàm verify cũ của Passport
const findOrCreateSocialUser = async (profileData) => {
  const { provider, externalId, email, fullName, avatarUrl } = profileData; // provider: 'GOOGLE' hoặc 'FACEBOOK'

  if (!email) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Không thể lấy email từ ${provider}.`
    );
  }

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // 1. Tìm AuthMethod bằng externalId và provider
    const authMethod = await transaction
      .request()
      .input('ExternalID', sql.VarChar, externalId)
      .input('LoginType', sql.VarChar, provider)
      .query(
        'SELECT * FROM AuthMethods WHERE ExternalID = @ExternalID AND LoginType = @LoginType;'
      )
      .then((result) => result.recordset[0]);

    let account;
    let accountId;

    if (authMethod) {
      // User đã đăng nhập bằng social này trước đó
      accountId = authMethod.AccountID;
      account = await authRepository.findAccountById(accountId); // Lấy thông tin account
      if (!account)
        throw new Error(
          `Account not found for existing ${provider} AuthMethod (AccountID: ${accountId})`
        );
      logger.info(
        `Existing ${provider} user found: AccountID=${accountId}, Email=${account.Email}`
      );
    } else {
      // Chưa có AuthMethod -> Tìm Account bằng email
      account = await authRepository.findAccountByEmail(email);

      if (account) {
        // Đã có tài khoản với email này
        accountId = account.AccountID;
        logger.info(
          `Account found via email for ${provider} login: AccountID=${accountId}, Email=${email}`
        );
        await authRepository.createAuthMethodInTransaction(
          {
            AccountID: accountId,
            LoginType: provider,
            ExternalID: externalId,
          },
          transaction
        );
        logger.info(
          `Linked ${provider} ID ${externalId} to existing AccountID ${accountId}`
        );
        if (!account.HasSocialLogin) {
          await authRepository.updateAccountById(
            accountId,
            { HasSocialLogin: true },
            transaction
          );
          logger.info(`Updated HasSocialLogin for AccountID ${accountId}`);
        }
      } else {
        // User hoàn toàn mới -> Tạo mới
        logger.info(`New user detected via ${provider} Login: Email=${email}`);
        const newAccountData = {
          Email: email,
          HashedPassword: null,
          RoleID: Roles.STUDENT,
          Status: AccountStatus.ACTIVE,
          EmailVerificationToken: null,
          EmailVerificationExpires: null,
          HasSocialLogin: true,
        };
        const newAccountResult =
          await authRepository.createAccountInTransaction(
            newAccountData,
            transaction
          );
        accountId = newAccountResult.AccountID;
        account = {
          AccountID: accountId,
          RoleID: newAccountData.RoleID,
          Status: newAccountData.Status,
        };

        const profileData = {
          AccountID: accountId,
          FullName: fullName || email.split('@')[0],
          AvatarUrl: avatarUrl,
        };
        await userRepository.createUserProfileInTransaction(
          profileData,
          transaction
        );

        await authRepository.createAuthMethodInTransaction(
          {
            AccountID: accountId,
            LoginType: provider,
            ExternalID: externalId,
          },
          transaction
        );
        logger.info(
          `Created new Account ${accountId}, Profile, and ${provider} AuthMethod for ${email}`
        );
      }
    }

    // 2. Kiểm tra trạng thái tài khoản
    if (
      account.Status === AccountStatus.BANNED ||
      account.Status === AccountStatus.INACTIVE
    ) {
      throw new ApiError(
        httpStatus.UNAUTHORIZED,
        'Tài khoản của bạn đã bị khóa hoặc không hoạt động.'
      );
    }

    // 3. Commit
    await transaction.commit();

    // 4. Trả về thông tin account cần thiết để tạo token
    return {
      accountId: account.AccountID,
      role: account.RoleID,
      email: account.Email, // Trả về thêm email và name để controller dùng
      fullName: fullName || account.FullName, // Lấy tên từ social hoặc profile nếu có
      avatarUrl: avatarUrl || account.AvatarUrl,
    };
  } catch (error) {
    logger.error(`Error during findOrCreateSocialUser (${provider}):`, error);
    await transaction.rollback();
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Đăng nhập bằng ${provider} thất bại.`
    );
  }
};

/**
 * Xử lý đăng nhập bằng Google (nhận ID Token từ frontend).
 * @param {string} idToken - ID Token nhận từ Google Sign-In client-side.
 * @returns {Promise<LoginResponse>} - Tokens và thông tin user.
 */
const loginWithGoogle = async (idToken) => {
  if (!googleClient) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Google authentication is not configured on the server.'
    );
  }

  try {
    // 1. Xác thực ID Token và lấy payload
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: config.googleAuth.clientID, // Chỉ định Client ID của bạn
    });
    const payload = ticket.getPayload();

    if (!payload) {
      throw new Error('Invalid ID token payload.');
    }

    // 2. Trích xuất thông tin user từ payload
    const googleProfileData = {
      provider: LoginType.GOOGLE,
      externalId: payload.sub, // Subject (Google User ID)
      email: payload.email?.toLowerCase(),
      fullName: payload.name,
      avatarUrl: payload.picture,
    };

    if (!googleProfileData.email) {
      // Trường hợp hiếm khi Google không trả về email dù đã request scope
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Không thể lấy địa chỉ email từ Google.'
      );
    }

    // 3. Tìm hoặc tạo user trong hệ thống (dùng hàm helper đã có)
    const systemUser = await findOrCreateSocialUser(googleProfileData);

    // 4. Tạo tokens hệ thống
    const tokenPayload = {
      accountId: systemUser.accountId,
      role: systemUser.role,
    };
    const appAccessToken = generateAccessToken(tokenPayload);
    const appRefreshToken = generateRefreshToken({
      accountId: systemUser.accountId,
    });

    return {
      accessToken: appAccessToken,
      refreshToken: appRefreshToken,
      user: {
        id: systemUser.accountId,
        email: systemUser.email,
        fullName: systemUser.fullName,
        avatarUrl: systemUser.avatarUrl,
        role: systemUser.role,
        status: AccountStatus.ACTIVE,
      },
    };
  } catch (error) {
    logger.error('Google ID Token verification/login failed:', error);
    // Lỗi từ google-auth-library thường là Error thông thường
    // Cần trả về lỗi rõ ràng cho client
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      `Xác thực Google thất bại: ${error.message || 'Unknown error'}`
    );
  }
};

/**
 * Xử lý đăng nhập bằng Facebook (nhận accessToken từ frontend).
 * @param {string} accessToken - Access Token từ Facebook SDK.
 * @returns {Promise<LoginResponse>} - Tokens và thông tin user.
 */
const loginWithFacebook = async (accessToken) => {
  try {
    // 1. Dùng accessToken để gọi Graph API lấy thông tin user
    // Cần App Secret để tạo appsecret_proof (tăng cường bảo mật)

    const appSecretProof = crypto
      .createHmac('sha256', config.facebookAuth.clientSecret)
      .update(accessToken)
      .digest('hex');

    const fields = 'id,name,email,picture.type(large)'; // Các trường cần lấy
    const graphApiUrl = `https://graph.facebook.com/me?fields=${fields}&access_token=${accessToken}&appsecret_proof=${appSecretProof}`;

    const userInfoResponse = await axios.get(graphApiUrl);
    const profile = userInfoResponse.data;

    if (!profile || !profile.id) {
      throw new Error('Failed to fetch user profile from Facebook.');
    }

    const facebookProfileData = {
      provider: LoginType.FACEBOOK,
      externalId: profile.id,
      email: profile.email?.toLowerCase(), // Email có thể không có
      fullName: profile.name,
      avatarUrl: profile.picture?.data?.url,
    };
    console.log('Facebook Profile Data:', facebookProfileData); // Log để kiểm tra

    // 2. Tìm hoặc tạo user trong hệ thống
    const systemUser = await findOrCreateSocialUser(facebookProfileData);

    // 3. Tạo tokens hệ thống
    const payload = { accountId: systemUser.accountId, role: systemUser.role };
    const appAccessToken = generateAccessToken(payload);
    const appRefreshToken = generateRefreshToken({
      accountId: systemUser.accountId,
    });

    return {
      accessToken: appAccessToken,
      refreshToken: appRefreshToken,
      user: {
        id: systemUser.accountId,
        email: systemUser.email,
        fullName: systemUser.fullName,
        avatarUrl: systemUser.avatarUrl,
        role: systemUser.role,
        status: AccountStatus.ACTIVE,
      },
    };
  } catch (error) {
    logger.error(
      'Facebook login failed:',
      error.response?.data?.error || error.message || error
    );
    const message =
      error.response?.data?.error?.message ||
      'Đăng nhập bằng Facebook thất bại.';
    const status = error.response?.status || httpStatus.INTERNAL_SERVER_ERROR;
    // Lỗi token hết hạn từ FB thường là 400 hoặc 401
    throw new ApiError(
      status === 401 ? httpStatus.BAD_REQUEST : status,
      message
    );
  }
};

/**
 * Hoàn tất đăng ký bằng Facebook khi người dùng tự cung cấp email.
 * @param {string} accessToken - Access Token từ Facebook SDK.
 * @param {string} userProvidedEmail - Email do người dùng nhập.
 * @returns {Promise<{ message: string }>} - Thông báo yêu cầu xác thực email.
 */
const completeFacebookRegistration = async (accessToken, userProvidedEmail) => {
  const email = userProvidedEmail.toLowerCase();

  // 1. Kiểm tra xem email người dùng nhập đã tồn tại trong hệ thống chưa
  const existingAccountByEmail = await authRepository.findAccountByEmail(email);
  if (existingAccountByEmail) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Địa chỉ email này đã được sử dụng.'
    );
  }

  // 2. Xác thực accessToken với Facebook và lấy thông tin profile (đặc biệt là facebookId)
  let profile;
  try {
    const appSecretProof = crypto
      .createHmac('sha256', config.facebookAuth.clientSecret)
      .update(accessToken)
      .digest('hex');
    const fields = 'id,name,picture.type(large)'; // Không cần request email nữa
    const graphApiUrl = `https://graph.facebook.com/me?fields=${fields}&access_token=${accessToken}&appsecret_proof=${appSecretProof}`;
    const userInfoResponse = await axios.get(graphApiUrl);
    profile = userInfoResponse.data;

    if (!profile || !profile.id) {
      throw new Error('Failed to fetch user profile from Facebook.');
    }
  } catch (error) {
    logger.error(
      'Facebook token validation failed during complete registration:',
      error.response?.data?.error || error.message || error
    );
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'Xác thực Facebook thất bại. Vui lòng thử đăng nhập lại bằng Facebook.'
    );
  }

  const facebookId = profile.id;
  const fullName = profile.name;
  const avatarUrl = profile.picture?.data?.url;

  // 3. Kiểm tra xem facebookId này đã liên kết với tài khoản nào khác chưa
  // (Trường hợp hiếm: user dùng FB khác để đăng nhập rồi cung cấp email của tk cũ)
  const existingAuthMethod = await authRepository.findAuthMethodByExternalId(
    facebookId,
    LoginType.FACEBOOK
  ); // Cần tạo hàm này
  if (existingAuthMethod) {
    // Lấy email của tài khoản đã liên kết
    const linkedAccount = await authRepository.findAccountById(
      existingAuthMethod.AccountID
    );
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Tài khoản Facebook này đã được liên kết với email ${linkedAccount?.Email || 'khác'}.`
    );
  }

  // 4. Bắt đầu Transaction để tạo tài khoản mới
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // 5. Tạo Accounts
    const verificationToken = generateRandomToken(); // Vẫn cần token để user xác thực email họ nhập
    const verificationExpires = calculateTokenExpiration(
      config.jwt.emailVerificationTokenExpiresMinutes
    );
    const newAccountData = {
      Email: email, // Dùng email người dùng nhập
      HashedPassword: null,
      RoleID: Roles.STUDENT, // Mặc định là Student khi hoàn tất đăng ký kiểu này? Hay GV? -> Nên là STUDENT
      Status: AccountStatus.PENDING_VERIFICATION, // *** Quan trọng: Chờ xác thực email đã nhập ***
      EmailVerificationToken: verificationToken,
      EmailVerificationExpires: verificationExpires,
      HasSocialLogin: true,
    };
    const newAccountResult = await authRepository.createAccountInTransaction(
      newAccountData,
      transaction
    );
    const accountId = newAccountResult.AccountID;

    // 6. Tạo UserProfiles
    const profileData = {
      AccountID: accountId,
      FullName: fullName || email.split('@')[0],
      AvatarUrl: avatarUrl,
    };
    await userRepository.createUserProfileInTransaction(
      profileData,
      transaction
    );

    // 7. Tạo AuthMethods (FACEBOOK)
    await authRepository.createAuthMethodInTransaction(
      {
        AccountID: accountId,
        LoginType: LoginType.FACEBOOK,
        ExternalID: facebookId,
      },
      transaction
    );

    await transaction.commit();

    // 8. Gửi email xác thực đến địa chỉ email người dùng đã nhập
    try {
      await emailSender.sendVerificationEmail(
        email,
        fullName || 'bạn',
        verificationToken
      );
      logger.info(
        `Verification email sent to user-provided email ${email} for Facebook registration completion.`
      );
    } catch (emailError) {
      logger.error(
        `Failed to send verification email to ${email} during Facebook completion:`,
        emailError
      );
      // Không throw lỗi, việc tạo tài khoản vẫn thành công về mặt kỹ thuật
    }

    logger.info(
      `Account ${accountId} created for Facebook user ${facebookId} with provided email ${email}. Awaiting email verification.`
    );
    return {
      message:
        'Thông tin đã được ghi nhận. Vui lòng kiểm tra email bạn vừa cung cấp để xác thực tài khoản.',
    };
  } catch (error) {
    logger.error(
      'Error during Facebook complete registration transaction:',
      error
    );
    await transaction.rollback();
    if (error instanceof ApiError) throw error;
    // Lỗi unique constraint có thể xảy ra nếu email được đăng ký trong lúc đang xử lý
    if (error.number === 2627 || error.number === 2601) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Địa chỉ email này vừa được đăng ký. Vui lòng thử đăng nhập.'
      );
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Hoàn tất đăng ký thất bại.'
    );
  }
};

/**
 * Change user's password.
 * @param {number} accountId - The ID of the user.
 * @param {string} currentPassword - The current password.
 * @param {string} newPassword - The new password.
 * @returns {Promise<void>}
 */
const changePassword = async (accountId, currentPassword, newPassword) => {
  const account = await accountRepository.findAccountById(accountId);
  if (!account) {
    // Điều này không nên xảy ra nếu user đã authenticate
    throw new ApiError(httpStatus.NOT_FOUND, 'Người dùng không tồn tại.');
  }

  const isPasswordMatch = await bcrypt.compare(
    currentPassword,
    account.PasswordHash
  );
  if (!isPasswordMatch) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'Mật khẩu hiện tại không đúng.'
    );
  }

  if (currentPassword === newPassword) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Mật khẩu mới không được trùng với mật khẩu hiện tại.'
    );
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  const updateResult = await accountRepository.updateAccountById(accountId, {
    PasswordHash: hashedPassword,
  });

  if (!updateResult || updateResult.rowsAffected[0] === 0) {
    logger.error(`Failed to update password in DB for accountId: ${accountId}`);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Đổi mật khẩu thất bại, vui lòng thử lại.'
    );
  }
  logger.info(`Password changed successfully for accountId: ${accountId}`);
  // Có thể gửi email thông báo đổi mật khẩu thành công nếu muốn
  // await emailService.sendPasswordChangedEmail(account.Email);
};

module.exports = {
  register,
  login,
  refreshAuth,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  registerInstructor,
  loginWithGoogle,
  loginWithFacebook,
  completeFacebookRegistration,
  changePassword,
};
