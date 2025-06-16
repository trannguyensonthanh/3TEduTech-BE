const { getConnection, sql } = require('../../database/connection');
const { toPascalCaseObject } = require('../../utils/caseConverter');
const logger = require('../../utils/logger');
/**
 * Tìm tài khoản bằng email.
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
    throw error;
  }
};
/**
 * Tìm tài khoản bằng ID.
 */
const findAccountById = async (accountId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, accountId);
    const result = await request.query(`
            SELECT AccountID, Email, RoleID, Status, HasSocialLogin, CreatedAt, UpdatedAt, HashedPassword 
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
 */
const createAccountInTransaction = async (accountData, transaction) => {
  const request = transaction.request();
  request.input('Email', sql.VarChar, accountData.Email);
  request.input('HashedPassword', sql.VarChar, accountData.HashedPassword);
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
  const result = await request.query(`
        INSERT INTO Accounts (Email, HashedPassword, RoleID, Status, EmailVerificationToken, EmailVerificationExpires, HasSocialLogin)
        OUTPUT Inserted.AccountID
        VALUES (@Email, @HashedPassword, @RoleID, @Status, @EmailVerificationToken, @EmailVerificationExpires, @HasSocialLogin);
    `);
  return result.recordset[0];
};
/**
 * Tạo phương thức đăng nhập mới (trong một transaction).
 */
const createAuthMethodInTransaction = async (authMethodData, transaction) => {
  const request = transaction.request();
  request.input('AccountID', sql.BigInt, authMethodData.AccountID);
  request.input('LoginType', sql.VarChar, authMethodData.LoginType);
  request.input('ExternalID', sql.VarChar, authMethodData.ExternalID);
  await request.query(`
        INSERT INTO AuthMethods (AccountID, LoginType, ExternalID)
        VALUES (@AccountID, @LoginType, @ExternalID);
    `);
};
/**
 * Tìm tài khoản bằng token xác thực email.
 */
const findAccountByVerificationToken = async (token) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('Token', sql.VarChar, token);
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
/**
 * Cập nhật tài khoản bằng ID.
 */
const updateAccountById = async (accountId, updateData, transaction = null) => {
  try {
    const updateDataPascalCase = toPascalCaseObject(updateData);
    const executor = transaction
      ? transaction.request()
      : (await getConnection()).request();
    executor.input('AccountID', sql.BigInt, accountId);
    executor.input('UpdatedAt', sql.DateTime2, new Date());
    const setClauses = ['UpdatedAt = @UpdatedAt'];
    Object.keys(updateDataPascalCase).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(updateDataPascalCase, key)) {
        const value = updateDataPascalCase[key];
        let sqlType;
        if (key === 'Status' || key === 'RoleID') sqlType = sql.VarChar;
        else if (key === 'HashedPassword' || key.includes('Token'))
          sqlType = sql.VarChar;
        else if (key.includes('Expires')) sqlType = sql.DateTime2;
        else if (key === 'HasSocialLogin') sqlType = sql.Bit;
        else {
          logger.warn(
            `Unhandled key type in updateAccountById for key: ${key}`
          );
          return;
        }
        executor.input(key, sqlType, value);
        setClauses.push(`${key} = @${key}`);
      }
    });
    if (setClauses.length === 1) {
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
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error updating account ${accountId}:`, error);
    throw error;
  }
};
/**
 * Tìm ID của các tài khoản có vai trò nằm trong danh sách cho trước.
 */
const findAccountIdsByRoles = async (roles) => {
  if (!roles || roles.length === 0) {
    return [];
  }
  try {
    const pool = await getConnection();
    const request = pool.request();
    const rolePlaceholders = roles.map((_, index) => `@role${index}`).join(',');
    roles.forEach((role, index) => {
      request.input(`role${index}`, sql.VarChar, role);
    });
    const result = await request.query(`
          SELECT AccountID
          FROM Accounts
          WHERE RoleID IN (${rolePlaceholders}) AND Status = 'ACTIVE';
      `);
    return result.recordset;
  } catch (error) {
    logger.error('Error finding account IDs by roles:', error);
    throw error;
  }
};
/**
 * Tìm AuthMethod bằng ExternalID và LoginType.
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
