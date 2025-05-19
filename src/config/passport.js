// const passport = require('passport');
// const GoogleStrategy = require('passport-google-oauth20').Strategy;
// const FacebookStrategy = require('passport-facebook').Strategy;
// const httpStatus = require('http-status').status;
// const config = require('./index');
// const logger = require('../utils/logger');
// const authRepository = require('../api/auth/auth.repository');
// const userRepository = require('../api/users/users.repository'); // Cần để tạo profile
// const LoginType = require('../core/enums/LoginType');
// const AccountStatus = require('../core/enums/AccountStatus');
// const Roles = require('../core/enums/Roles');
// const { getConnection, sql } = require('../database/connection'); // Cần cho transaction
// const ApiError = require('../core/errors/ApiError');

// /**
//  * Hàm Verify Callback cho Google Strategy.
//  * Sẽ được gọi sau khi Google xác thực user và trả về profile.
//  */
// const googleVerify = async (accessToken, refreshToken, profile, done) => {
//   const googleId = profile.id;
//   const email =
//     profile.emails && profile.emails[0]
//       ? profile.emails[0].value.toLowerCase()
//       : null;
//   const fullName = profile.displayName;
//   const avatarUrl =
//     profile.photos && profile.photos[0] ? profile.photos[0].value : null;

//   if (!email) {
//     logger.error('Google profile did not return an email address.');
//     return done(new Error('Không thể lấy địa chỉ email từ Google.'), null);
//   }

//   const pool = await getConnection();
//   const transaction = new sql.Transaction(pool);

//   try {
//     await transaction.begin();

//     // 1. Tìm AuthMethod bằng googleId
//     const authMethod = await transaction
//       .request()
//       .input('ExternalID', sql.VarChar, googleId)
//       .input('LoginType', sql.VarChar, LoginType.GOOGLE)
//       .query(
//         'SELECT * FROM AuthMethods WHERE ExternalID = @ExternalID AND LoginType = @LoginType;'
//       )
//       .then((result) => result.recordset[0]);

//     let account;
//     let accountId;

//     if (authMethod) {
//       // User đã đăng nhập bằng Google trước đó
//       accountId = authMethod.AccountID;
//       account = await authRepository.findAccountById(accountId); // Lấy thông tin account
//       if (!account) {
//         // Trường hợp lạ: AuthMethod tồn tại nhưng Account không? -> Lỗi dữ liệu
//         throw new Error(
//           `Account not found for existing Google AuthMethod (AccountID: ${accountId})`
//         );
//       }
//       logger.info(
//         `Existing Google user found: AccountID=${accountId}, Email=${account.Email}`
//       );
//     } else {
//       // Chưa có AuthMethod -> Tìm Account bằng email
//       account = await authRepository.findAccountByEmail(email);

//       if (account) {
//         // Đã có tài khoản với email này (có thể tạo bằng email/pass hoặc social khác)
//         accountId = account.AccountID;
//         logger.info(
//           `Account found via email for Google login: AccountID=${accountId}, Email=${email}`
//         );

//         // Tạo AuthMethod liên kết Google cho tài khoản này
//         await authRepository.createAuthMethodInTransaction(
//           {
//             AccountID: accountId,
//             LoginType: LoginType.GOOGLE,
//             ExternalID: googleId,
//           },
//           transaction
//         );
//         logger.info(
//           `Linked Google ID ${googleId} to existing AccountID ${accountId}`
//         );

//         // Cập nhật HasSocialLogin nếu tài khoản này chưa có
//         if (!account.HasSocialLogin) {
//           await authRepository.updateAccountById(
//             accountId,
//             { HasSocialLogin: true },
//             transaction
//           ); // Truyền transaction vào update
//           logger.info(`Updated HasSocialLogin for AccountID ${accountId}`);
//         }
//       } else {
//         // Không tìm thấy account bằng email -> User hoàn toàn mới -> Tạo mới
//         logger.info(`New user detected via Google Login: Email=${email}`);
//         // Tạo Account mới
//         const newAccountData = {
//           Email: email,
//           HashedPassword: null, // Không cần password
//           RoleID: Roles.STUDENT, // Mặc định là Student
//           Status: AccountStatus.ACTIVE, // Active luôn vì email đã verify bởi Google
//           EmailVerificationToken: null,
//           EmailVerificationExpires: null,
//           HasSocialLogin: true,
//         };
//         const newAccountResult =
//           await authRepository.createAccountInTransaction(
//             newAccountData,
//             transaction
//           );
//         accountId = newAccountResult.AccountID;
//         account = {
//           AccountID: accountId,
//           RoleID: newAccountData.RoleID,
//           Status: newAccountData.Status,
//         }; // Tạo object account tạm thời

//         // Tạo UserProfile
//         const profileData = {
//           AccountID: accountId,
//           FullName: fullName || email.split('@')[0], // Lấy tên từ Google hoặc tạo từ email
//           AvatarUrl: avatarUrl,
//         };
//         await userRepository.createUserProfileInTransaction(
//           profileData,
//           transaction
//         );

//         // Tạo AuthMethod
//         await authRepository.createAuthMethodInTransaction(
//           {
//             AccountID: accountId,
//             LoginType: LoginType.GOOGLE,
//             ExternalID: googleId,
//           },
//           transaction
//         );
//         logger.info(
//           `Created new Account ${accountId}, Profile, and Google AuthMethod for ${email}`
//         );
//       }
//     }

//     // 2. Kiểm tra trạng thái tài khoản (sau khi đã có accountId)
//     if (
//       account.Status === AccountStatus.BANNED ||
//       account.Status === AccountStatus.INACTIVE
//     ) {
//       throw new ApiError(
//         httpStatus.UNAUTHORIZED,
//         'Tài khoản của bạn đã bị khóa hoặc không hoạt động.'
//       );
//     }

//     // 3. Commit transaction
//     await transaction.commit();

//     // 4. Trả về user cho Passport
//     const userPayload = {
//       accountId: account.AccountID,
//       role: account.RoleID,
//       // Thêm các thông tin khác nếu cần thiết cho việc tạo token sau này
//     };
//     return done(null, userPayload); // Thành công
//   } catch (error) {
//     logger.error('Error during Google OAuth verification:', error);
//     await transaction.rollback();
//     return done(error, null); // Báo lỗi cho Passport
//   }
// };

// // === Facebook Verify Callback ===
// const facebookVerify = async (accessToken, refreshToken, profile, done) => {
//   const facebookId = profile.id;
//   // Facebook có thể không trả về email nếu user không cấp quyền hoặc không có email chính
//   const email =
//     profile.emails && profile.emails[0]
//       ? profile.emails[0].value.toLowerCase()
//       : null;
//   // Facebook có thể tách tên riêng: profile.name.givenName, profile.name.familyName
//   const fullName = profile.displayName;
//   const avatarUrl =
//     profile.photos && profile.photos[0] ? profile.photos[0].value : null;

//   // *** Quan trọng: Facebook có thể không trả về email ***
//   if (!email) {
//     // Xử lý trường hợp không có email:
//     // 1. Báo lỗi và yêu cầu user cung cấp email sau?
//     // 2. Tạo tài khoản không cần email (không khuyến khích)?
//     // 3. Dùng facebookId làm định danh chính thay email? (Phức tạp)
//     // -> Tạm thời báo lỗi
//     logger.error(
//       `Facebook profile for ID ${facebookId} did not return an email address.`
//     );
//     return done(
//       new Error(
//         'Không thể lấy địa chỉ email từ Facebook. Vui lòng kiểm tra quyền hoặc thử lại.'
//       ),
//       null
//     );
//   }

//   const pool = await getConnection();
//   const transaction = new sql.Transaction(pool);

//   try {
//     await transaction.begin();

//     // 1. Tìm AuthMethod bằng facebookId
//     const authMethod = await transaction
//       .request()
//       .input('ExternalID', sql.VarChar, facebookId)
//       .input('LoginType', sql.VarChar, LoginType.FACEBOOK)
//       .query(
//         'SELECT * FROM AuthMethods WHERE ExternalID = @ExternalID AND LoginType = @LoginType;'
//       )
//       .then((result) => result.recordset[0]);

//     let account;
//     let accountId;

//     if (authMethod) {
//       // User đã đăng nhập bằng Facebook trước đó
//       accountId = authMethod.AccountID;
//       account = await authRepository.findAccountById(accountId);
//       if (!account)
//         throw new Error(
//           `Account not found for existing Facebook AuthMethod (AccountID: ${accountId})`
//         );
//       logger.info(
//         `Existing Facebook user found: AccountID=${accountId}, Email=${account.Email}`
//       );
//     } else {
//       // Chưa có AuthMethod -> Tìm Account bằng email
//       account = await authRepository.findAccountByEmail(email);

//       if (account) {
//         // Đã có tài khoản với email này
//         accountId = account.AccountID;
//         logger.info(
//           `Account found via email for Facebook login: AccountID=${accountId}, Email=${email}`
//         );
//         await authRepository.createAuthMethodInTransaction(
//           {
//             AccountID: accountId,
//             LoginType: LoginType.FACEBOOK,
//             ExternalID: facebookId,
//           },
//           transaction
//         );
//         logger.info(
//           `Linked Facebook ID ${facebookId} to existing AccountID ${accountId}`
//         );
//         if (!account.HasSocialLogin) {
//           await authRepository.updateAccountById(
//             accountId,
//             { HasSocialLogin: true },
//             transaction
//           );
//           logger.info(`Updated HasSocialLogin for AccountID ${accountId}`);
//         }
//       } else {
//         // User hoàn toàn mới -> Tạo mới
//         logger.info(`New user detected via Facebook Login: Email=${email}`);
//         const newAccountData = {
//           Email: email,
//           HashedPassword: null,
//           RoleID: Roles.STUDENT,
//           Status: AccountStatus.ACTIVE,
//           EmailVerificationToken: null,
//           EmailVerificationExpires: null,
//           HasSocialLogin: true,
//         };
//         const newAccountResult =
//           await authRepository.createAccountInTransaction(
//             newAccountData,
//             transaction
//           );
//         accountId = newAccountResult.AccountID;
//         account = {
//           AccountID: accountId,
//           RoleID: newAccountData.RoleID,
//           Status: newAccountData.Status,
//         };

//         const profileData = {
//           AccountID: accountId,
//           FullName: fullName || email.split('@')[0],
//           AvatarUrl: avatarUrl,
//         };
//         await userRepository.createUserProfileInTransaction(
//           profileData,
//           transaction
//         );

//         await authRepository.createAuthMethodInTransaction(
//           {
//             AccountID: accountId,
//             LoginType: LoginType.FACEBOOK,
//             ExternalID: facebookId,
//           },
//           transaction
//         );
//         logger.info(
//           `Created new Account ${accountId}, Profile, and Facebook AuthMethod for ${email}`
//         );
//       }
//     }

//     // 2. Kiểm tra trạng thái tài khoản
//     if (
//       account.Status === AccountStatus.BANNED ||
//       account.Status === AccountStatus.INACTIVE
//     ) {
//       throw new ApiError(
//         httpStatus.UNAUTHORIZED,
//         'Tài khoản của bạn đã bị khóa hoặc không hoạt động.'
//       );
//     }

//     // 3. Commit
//     await transaction.commit();

//     // 4. Trả về user cho Passport
//     const userPayload = { accountId: account.AccountID, role: account.RoleID };
//     return done(null, userPayload);
//   } catch (error) {
//     logger.error('Error during Facebook OAuth verification:', error);
//     await transaction.rollback();
//     return done(error, null);
//   }
// };

// // Cấu hình Google Strategy
// if (config.googleAuth.clientID && config.googleAuth.clientSecret) {
//   passport.use(
//     new GoogleStrategy(
//       {
//         clientID: config.googleAuth.clientID,
//         clientSecret: config.googleAuth.clientSecret,
//         callbackURL: config.googleAuth.callbackURL,
//         // passReqToCallback: true // Nếu cần truy cập req trong hàm verify
//       },
//       googleVerify
//     )
//   ); // Sử dụng hàm verify đã viết ở trên

//   logger.info('Passport Google OAuth2 strategy configured.');
// } else {
//   logger.warn(
//     'Google OAuth credentials are not configured. Google login will be disabled.'
//   );
// }

// // Facebook Strategy (Thêm mới)
// if (config.facebookAuth.clientID && config.facebookAuth.clientSecret) {
//   passport.use(
//     new FacebookStrategy(
//       {
//         clientID: config.facebookAuth.clientID,
//         clientSecret: config.facebookAuth.clientSecret,
//         callbackURL: config.facebookAuth.callbackURL,
//         profileFields: ['id', 'displayName', 'emails', 'photos'], // Các trường cần lấy
//         enableProof: true, // Tăng cường bảo mật
//       },
//       facebookVerify
//     )
//   ); // Sử dụng hàm verify mới
//   logger.info('Passport Facebook strategy configured.');
// } else {
//   logger.warn(
//     'Facebook OAuth credentials are not configured. Facebook login will be disabled.'
//   );
// }

// // Không cần serialize/deserialize user nếu dùng JWT (không dùng session)
// // passport.serializeUser((user, done) => {
// //     done(null, user.accountId);
// // });
// // passport.deserializeUser(async (id, done) => {
// //     try {
// //         const account = await authRepository.findAccountById(id);
// //         done(null, account); // Gắn account đầy đủ vào req.user nếu dùng session
// //     } catch (error) {
// //         done(error, null);
// //     }
// // });

// module.exports = passport; // Export instance passport đã cấu hình
