// File: src/api/auth/auth.repository.js
const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');

/**
 * Tìm tài khoản bằng email.
 * @param {string} email - Email cần tìm.
 * @returns {Promise<object|null>} - Đối tượng tài khoản hoặc null nếu không tìm thấy.
 */
const findAccountByEmail = async (email) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('Email', sql.VarChar, email);
    const result = await request.query(`
            SELECT AccountID, Email, HashedPassword, RoleID, Status, HasSocialLogin
            FROM Accounts
            WHERE Email = @Email
        `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error('Error in findAccountByEmail:', error);
    throw error; // Re-throw để service xử lý
  }
};

/**
 * Tìm tài khoản bằng ID.
 * @param {number} accountId - ID tài khoản.
 * @returns {Promise<object|null>} - Đối tượng tài khoản hoặc null.
 */
const findAccountById = async (accountId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, accountId);
    const result = await request.query(`
            SELECT AccountID, Email, RoleID, Status, HasSocialLogin, CreatedAt, UpdatedAt
            FROM Accounts
            WHERE AccountID = @AccountID
        `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error in findAccountById (${accountId}):`, error);
    throw error;
  }
};

/**
 * Tạo tài khoản mới (trong một transaction).
 * @param {object} accountData - Dữ liệu tài khoản { Email, HashedPassword, RoleID, Status, EmailVerificationToken, EmailVerificationExpires, HasSocialLogin }.
 * @param {object} transaction - Đối tượng transaction từ mssql.
 * @returns {Promise<object>} - Đối tượng tài khoản mới được tạo (chỉ AccountID).
 */
const createAccountInTransaction = async (accountData, transaction) => {
  const request = transaction.request(); // Sử dụng request từ transaction
  request.input('Email', sql.VarChar, accountData.Email);
  request.input('HashedPassword', sql.VarChar, accountData.HashedPassword); // Có thể NULL
  request.input('RoleID', sql.VarChar, accountData.RoleID);
  request.input('Status', sql.VarChar, accountData.Status);
  request.input(
    'EmailVerificationToken',
    sql.VarChar,
    accountData.EmailVerificationToken
  );
  request.input(
    'EmailVerificationExpires',
    sql.DateTime2,
    accountData.EmailVerificationExpires
  );
  request.input('HasSocialLogin', sql.Bit, accountData.HasSocialLogin);

  // OUTPUT Inserted.AccountID để lấy ID vừa tạo
  const result = await request.query(`
        INSERT INTO Accounts (Email, HashedPassword, RoleID, Status, EmailVerificationToken, EmailVerificationExpires, HasSocialLogin)
        OUTPUT Inserted.AccountID
        VALUES (@Email, @HashedPassword, @RoleID, @Status, @EmailVerificationToken, @EmailVerificationExpires, @HasSocialLogin);
    `);
  return result.recordset[0]; // Trả về { AccountID: newId }
};

/**
 * Tạo phương thức đăng nhập mới (trong một transaction).
 * @param {object} authMethodData - Dữ liệu { AccountID, LoginType, ExternalID }.
 * @param {object} transaction - Đối tượng transaction từ mssql.
 * @returns {Promise<void>}
 */
const createAuthMethodInTransaction = async (authMethodData, transaction) => {
  const request = transaction.request();
  request.input('AccountID', sql.BigInt, authMethodData.AccountID);
  request.input('LoginType', sql.VarChar, authMethodData.LoginType);
  request.input('ExternalID', sql.VarChar, authMethodData.ExternalID); // Có thể NULL

  await request.query(`
        INSERT INTO AuthMethods (AccountID, LoginType, ExternalID)
        VALUES (@AccountID, @LoginType, @ExternalID);
    `);
};

/**
 * Tìm tài khoản bằng token xác thực email.
 * @param {string} token - Token cần tìm.
 * @returns {Promise<object|null>} - Tài khoản hoặc null.
 */
const findAccountByVerificationToken = async (token) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('Token', sql.VarChar, token);
    console.log('Token:', token); // Log token để kiểm tra
    const result = await request.query(`
            SELECT AccountID, Email, Status, EmailVerificationExpires
            FROM Accounts
            WHERE EmailVerificationToken = @Token
        `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error('Error in findAccountByVerificationToken:', error);
    throw error;
  }
};

/**
 * Tìm tài khoản bằng token reset password.
 * @param {string} token - Token cần tìm.
 * @returns {Promise<object|null>} - Tài khoản hoặc null.
 */
const findAccountByPasswordResetToken = async (token) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('Token', sql.VarChar, token);
    const result = await request.query(`
            SELECT AccountID, Email, Status, PasswordResetExpires
            FROM Accounts
            WHERE PasswordResetToken = @Token
        `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error('Error in findAccountByPasswordResetToken:', error);
    throw error;
  }
};

// src/api/auth/auth.repository.js
// ... (các hàm khác)

/**
 * Cập nhật tài khoản bằng ID.
 * @param {number} accountId
 * @param {object} updateData
 * @param {object} [transaction=null] - Transaction nếu có. // *** THÊM THAM SỐ transaction ***
 * @returns {Promise<number>}
 */
const updateAccountById = async (accountId, updateData, transaction = null) => {
  try {
    // *** Sử dụng transaction nếu được cung cấp ***
    const executor = transaction
      ? transaction.request()
      : (await getConnection()).request();
    executor.input('AccountID', sql.BigInt, accountId);
    executor.input('UpdatedAt', sql.DateTime2, new Date());

    const setClauses = ['UpdatedAt = @UpdatedAt'];
    Object.keys(updateData).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(updateData, key)) {
        // Rất quan trọng: Validate key để tránh SQL Injection nếu key đến từ bên ngoài
        // Trong trường hợp này, key đến từ service nên có thể coi là an toàn
        const value = updateData[key];
        // Xác định kiểu dữ liệu SQL dựa trên key
        let sqlType;
        if (key === 'Status' || key === 'RoleID') sqlType = sql.VarChar;
        else if (key === 'HashedPassword' || key.includes('Token'))
          sqlType = sql.VarChar;
        else if (key.includes('Expires')) sqlType = sql.DateTime2;
        else if (key === 'HasSocialLogin') sqlType = sql.Bit;
        // Thêm các kiểu khác nếu cần
        else {
          logger.warn(
            `Unhandled key type in updateAccountById for key: ${key}`
          );
          return; // Bỏ qua nếu không xác định được kiểu
        }

        executor.input(key, sqlType, value);
        setClauses.push(`${key} = @${key}`);
      }
    });

    if (setClauses.length === 1) {
      // Chỉ có UpdatedAt, không có gì khác để cập nhật
      logger.warn(
        `updateAccountById called for AccountID ${accountId} with no data to update.`
      );
      return 0;
    }

    const query = `
            UPDATE Accounts
            SET ${setClauses.join(', ')}
            WHERE AccountID = @AccountID;
        `;

    const result = await executor.query(query);
    return result.rowsAffected[0]; // Số dòng bị ảnh hưởng
  } catch (error) {
    logger.error(`Error updating account ${accountId}:`, error);
    throw error;
  }
};

/**
 * Tìm ID của các tài khoản có vai trò nằm trong danh sách cho trước.
 * @param {Array<string>} roles - Mảng các RoleID (['ADMIN', 'SUPERADMIN']).
 * @returns {Promise<Array<{AccountID: number}>>} - Mảng các object chứa AccountID.
 */
const findAccountIdsByRoles = async (roles) => {
  if (!roles || roles.length === 0) {
    return [];
  }
  try {
    const pool = await getConnection();
    const request = pool.request();
    // Tạo placeholders và thêm input cho từng role
    const rolePlaceholders = roles.map((_, index) => `@role${index}`).join(',');
    roles.forEach((role, index) => {
      request.input(`role${index}`, sql.VarChar, role);
    });

    const result = await request.query(`
          SELECT AccountID
          FROM Accounts
          WHERE RoleID IN (${rolePlaceholders}) AND Status = 'ACTIVE'; -- Chỉ lấy admin active
      `);
    return result.recordset; // Mảng các object { AccountID: ... }
  } catch (error) {
    logger.error('Error finding account IDs by roles:', error);
    throw error;
  }
};

/**
 * Tìm AuthMethod bằng ExternalID và LoginType.
 * @param {string} externalId
 * @param {string} loginType
 * @returns {Promise<object|null>}
 */
const findAuthMethodByExternalId = async (externalId, loginType) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('ExternalID', sql.VarChar, externalId);
    request.input('LoginType', sql.VarChar, loginType);
    const result = await request.query(`
          SELECT * FROM AuthMethods WHERE ExternalID = @ExternalID AND LoginType = @LoginType;
      `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(
      `Error finding auth method by external ID ${externalId} (${loginType}):`,
      error
    );
    throw error;
  }
};

module.exports = {
  findAccountByEmail,
  findAccountById,
  createAccountInTransaction,
  createAuthMethodInTransaction,
  findAccountByVerificationToken,
  findAccountByPasswordResetToken,
  updateAccountById,
  findAccountIdsByRoles,
  findAuthMethodByExternalId,
};
