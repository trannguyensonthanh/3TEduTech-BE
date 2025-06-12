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
const userRepository = require('../users/users.repository');
const accountRepository = require('./auth.repository');
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
const skillsRepository = require('../skills/skills.repository');
const instructorRepository = require('../instructors/instructors.repository');
const AccountStatus = require('../../core/enums/AccountStatus');
const Roles = require('../../core/enums/Roles');
const LoginType = require('../../core/enums/LoginType');
const emailSender = require('../../utils/emailSender');
const config = require('../../config');
const settingsService = require('../settings/settings.service');

let googleClient = null;
if (config.googleAuth.clientID) {
  googleClient = new OAuth2Client(config.googleAuth.clientID);
  logger.info('Google OAuth2Client initialized.');
} else {
  logger.warn('Google ClientID not configured, Google login might fail.');
}
const register = async (userData) => {
  const allowRegistration = await settingsService.getSettingValue(
    'AllowUserRegistration',
    'true'
  );
  if (allowRegistration !== 'true') {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Chức năng đăng ký người dùng mới hiện đang tạm khóa.'
    );
  }
  const { email, password, fullName, roleId = Roles.STUDENT } = userData;
  const existingAccount = await authRepository.findAccountByEmail(email);
  if (existingAccount) {
    if (existingAccount.Status === AccountStatus.PENDING_VERIFICATION) {
      const verificationToken = generateRandomToken();
      const verificationExpires = calculateTokenExpiration(
        jwtConfig.emailVerificationTokenExpiresMinutes
      );
      await authRepository.updateAccountById(existingAccount.AccountID, {
        EmailVerificationToken: verificationToken,
        EmailVerificationExpires: verificationExpires,
      });
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
      return {
        message:
          'Email đã tồn tại nhưng chưa được xác thực. Vui lòng kiểm tra email để xác thực tài khoản.',
      };
    }
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email đã được sử dụng.');
  }
  const hashedPassword = await hashPassword(password);
  const verificationToken = generateRandomToken();
  const verificationExpires = calculateTokenExpiration(
    jwtConfig.emailVerificationTokenExpiresMinutes
  );
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
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
    const profileData = {
      AccountID: accountId,
      FullName: fullName,
    };
    await userRepository.createUserProfileInTransaction(
      profileData,
      transaction
    );
    const authMethodData = {
      AccountID: accountId,
      LoginType: LoginType.EMAIL,
      ExternalID: null,
    };
    await authRepository.createAuthMethodInTransaction(
      authMethodData,
      transaction
    );
    await transaction.commit();
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
  const payload = { accountId: account.AccountID, role: account.RoleID };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken({ accountId: account.AccountID });
  const userProfile = await userRepository.findUserProfileById(
    account.AccountID
  );
  return {
    accessToken,
    refreshToken,
    user: {
      id: userProfile.AccountID,
      email: userProfile.Email,
      fullName: userProfile.FullName,
      avatarUrl: userProfile.AvatarUrl,
      role: userProfile.RoleID,
      status: userProfile.Status,
    },
  };
};
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
  const newAccessToken = generateAccessToken({
    accountId: account.AccountID,
    role: account.RoleID,
  });
  return { accessToken: newAccessToken };
};
const verifyEmail = async (verificationToken) => {
  const account =
    await authRepository.findAccountByVerificationToken(verificationToken);
  if (!account) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Token xác thực không hợp lệ.');
  }
  if (moment().isAfter(account.EmailVerificationExpires)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Token xác thực đã hết hạn.');
  }
  if (account.Status === AccountStatus.ACTIVE) {
    logger.info(`Account ${account.AccountID} is already verified.`);
    return;
  }
  await authRepository.updateAccountById(account.AccountID, {
    Status: AccountStatus.ACTIVE,
    EmailVerificationToken: null,
    EmailVerificationExpires: null,
  });
  logger.info(`Account ${account.AccountID} verified successfully.`);
};
const requestPasswordReset = async (email) => {
  const account = await authRepository.findAccountByEmail(email);
  if (!account) {
    logger.warn(`Password reset requested for non-existent email: ${email}`);
    return;
  }
  if (account.Status !== AccountStatus.ACTIVE) {
    logger.warn(
      `Password reset requested for inactive/banned account: ${email} (${account.Status})`
    );
    return;
  }
  const resetToken = generateRandomToken();
  const resetExpires = calculateTokenExpiration(
    jwtConfig.passwordResetTokenExpiresMinutes
  );
  await authRepository.updateAccountById(account.AccountID, {
    PasswordResetToken: resetToken,
    PasswordResetExpires: resetExpires,
  });
  try {
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
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Không thể gửi email đặt lại mật khẩu lúc này.'
    );
  }
  logger.info(
    `Password reset requested for ${email}. Token generated (for debugging): ${resetToken}`
  );
};
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
    PasswordResetToken: null,
    PasswordResetExpires: null,
  });
  logger.info(`Password reset successfully for account ${account.AccountID}`);
};
const registerInstructor = async (instructorData) => {
  const allowInstructorRegistration = await settingsService.getSettingValue(
    'AllowInstructorRegistration',
    'true'
  );
  if (allowInstructorRegistration !== 'true') {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Chức năng đăng ký giảng viên hiện đang tạm khóa.'
    );
  }

  const {
    email,
    password,
    fullName,
    professionalTitle,
    bio,
    skills = [],
    socialLinks = [],
  } = instructorData;
  const existingAccount = await authRepository.findAccountByEmail(email);
  if (existingAccount) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email đã được sử dụng.');
  }
  const hashedPassword = await hashPassword(password);
  const verificationToken = generateRandomToken();
  const verificationExpires = calculateTokenExpiration(
    config.jwt.emailVerificationTokenExpiresMinutes
  );
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const accountData = {
      Email: email,
      HashedPassword: hashedPassword,
      RoleID: Roles.INSTRUCTOR,
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
    const profileData = {
      AccountID: accountId,
      FullName: fullName,
    };
    await userRepository.createUserProfileInTransaction(
      profileData,
      transaction
    );
    await instructorRepository.findOrCreateInstructorProfile(
      accountId,
      transaction
    );
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
    if (skills && skills.length > 0) {
      const skillIdsToAdd = [];
      for (const skillInput of skills) {
        let skillId;
        if (typeof skillInput === 'number') {
          const existingSkill =
            await skillsRepository.findSkillById(skillInput);
          if (existingSkill) {
            skillId = existingSkill.SkillID;
          } else {
            logger.warn(
              `Skill ID ${skillInput} provided during instructor registration not found. Skipping.`
            );
          }
        } else if (typeof skillInput === 'string' && skillInput.trim()) {
          const skill = await skillsRepository.findOrCreateSkill(
            skillInput.trim(),
            transaction
          );
          skillId = skill.SkillID;
        }
        if (skillId && !skillIdsToAdd.includes(skillId)) {
          skillIdsToAdd.push(skillId);
        }
      }
      for (const idToAdd of skillIdsToAdd) {
        try {
          await instructorRepository.addInstructorSkill(
            accountId,
            idToAdd,
            transaction
          );
        } catch (skillError) {
          if (
            !(
              skillError instanceof ApiError &&
              skillError.statusCode === httpStatus.BAD_REQUEST
            )
          ) {
            throw skillError;
          }
        }
      }
    }
    if (socialLinks && socialLinks.length > 0) {
      for (const link of socialLinks) {
        await instructorRepository.createOrUpdateSocialLink(
          accountId,
          link.platform,
          link.url,
          transaction
        );
      }
    }
    const authMethodData = {
      AccountID: accountId,
      LoginType: LoginType.EMAIL,
      ExternalID: null,
    };
    await authRepository.createAuthMethodInTransaction(
      authMethodData,
      transaction
    );
    await transaction.commit();
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
const findOrCreateSocialUser = async (profileData) => {
  const { provider, externalId, email, fullName, avatarUrl } = profileData;
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
      accountId = authMethod.AccountID;
      account = await authRepository.findAccountById(accountId);
      if (!account)
        throw new Error(
          `Account not found for existing ${provider} AuthMethod (AccountID: ${accountId})`
        );
      logger.info(
        `Existing ${provider} user found: AccountID=${accountId}, Email=${account.Email}`
      );
    } else {
      account = await authRepository.findAccountByEmail(email);
      if (account) {
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
    if (
      account.Status === AccountStatus.BANNED ||
      account.Status === AccountStatus.INACTIVE
    ) {
      throw new ApiError(
        httpStatus.UNAUTHORIZED,
        'Tài khoản của bạn đã bị khóa hoặc không hoạt động.'
      );
    }
    await transaction.commit();
    return {
      accountId: account.AccountID,
      role: account.RoleID,
      email: account.Email,
      fullName: fullName || account.FullName,
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
const loginWithGoogle = async (idToken) => {
  if (!googleClient) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Google authentication is not configured on the server.'
    );
  }
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: config.googleAuth.clientID,
    });
    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('Invalid ID token payload.');
    }
    const googleProfileData = {
      provider: LoginType.GOOGLE,
      externalId: payload.sub,
      email: payload.email?.toLowerCase(),
      fullName: payload.name,
      avatarUrl: payload.picture,
    };
    if (!googleProfileData.email) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Không thể lấy địa chỉ email từ Google.'
      );
    }
    const systemUser = await findOrCreateSocialUser(googleProfileData);
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
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      `Xác thực Google thất bại: ${error.message || 'Unknown error'}`
    );
  }
};
const loginWithFacebook = async (accessToken) => {
  try {
    const appSecretProof = crypto
      .createHmac('sha256', config.facebookAuth.clientSecret)
      .update(accessToken)
      .digest('hex');
    const fields = 'id,name,email,picture.type(large)';
    const graphApiUrl = `https://graph.facebook.com/me?fields=${fields}&access_token=${accessToken}&appsecret_proof=${appSecretProof}`;
    const userInfoResponse = await axios.get(graphApiUrl);
    const profile = userInfoResponse.data;
    if (!profile || !profile.id) {
      throw new Error('Failed to fetch user profile from Facebook.');
    }
    const facebookProfileData = {
      provider: LoginType.FACEBOOK,
      externalId: profile.id,
      email: profile.email?.toLowerCase(),
      fullName: profile.name,
      avatarUrl: profile.picture?.data?.url,
    };
    const systemUser = await findOrCreateSocialUser(facebookProfileData);
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
    throw new ApiError(
      status === 401 ? httpStatus.BAD_REQUEST : status,
      message
    );
  }
};
const completeFacebookRegistration = async (accessToken, userProvidedEmail) => {
  const email = userProvidedEmail.toLowerCase();
  const existingAccountByEmail = await authRepository.findAccountByEmail(email);
  if (existingAccountByEmail) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Địa chỉ email này đã được sử dụng.'
    );
  }
  let profile;
  try {
    const appSecretProof = crypto
      .createHmac('sha256', config.facebookAuth.clientSecret)
      .update(accessToken)
      .digest('hex');
    const fields = 'id,name,picture.type(large)';
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
  const existingAuthMethod = await authRepository.findAuthMethodByExternalId(
    facebookId,
    LoginType.FACEBOOK
  );
  if (existingAuthMethod) {
    const linkedAccount = await authRepository.findAccountById(
      existingAuthMethod.AccountID
    );
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Tài khoản Facebook này đã được liên kết với email ${linkedAccount?.Email || 'khác'}.`
    );
  }
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const verificationToken = generateRandomToken();
    const verificationExpires = calculateTokenExpiration(
      config.jwt.emailVerificationTokenExpiresMinutes
    );
    const newAccountData = {
      Email: email,
      HashedPassword: null,
      RoleID: Roles.STUDENT,
      Status: AccountStatus.PENDING_VERIFICATION,
      EmailVerificationToken: verificationToken,
      EmailVerificationExpires: verificationExpires,
      HasSocialLogin: true,
    };
    const newAccountResult = await authRepository.createAccountInTransaction(
      newAccountData,
      transaction
    );
    const accountId = newAccountResult.AccountID;
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
        LoginType: LoginType.FACEBOOK,
        ExternalID: facebookId,
      },
      transaction
    );
    await transaction.commit();
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
const changePassword = async (accountId, currentPassword, newPassword) => {
  const account = await accountRepository.findAccountById(accountId);
  if (!account) {
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
