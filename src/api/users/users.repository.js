const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');

/**
 * Tìm user (bao gồm cả thông tin profile và account) theo số điện thoại.
 * @param {string} phoneNumber
 * @returns {Promise<object|null>}
 */
const findUserByPhoneNumber = async (phoneNumber) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('PhoneNumber', sql.VarChar, phoneNumber);
    const result = await request.query(`
      SELECT
        a.AccountID,
        a.Email,
        a.RoleID,
        a.Status,
        a.HasSocialLogin,
        a.CreatedAt AS AccountCreatedAt,
        a.UpdatedAt AS AccountUpdatedAt,
        up.FullName,
        up.AvatarUrl,
        up.CoverImageUrl,
        up.Gender,
        up.BirthDate,
        up.PhoneNumber,
        up.Headline,
        up.Location
      FROM Accounts a
      LEFT JOIN UserProfiles up ON a.AccountID = up.AccountID
      WHERE up.PhoneNumber = @PhoneNumber
    `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error in findUserByPhoneNumber (${phoneNumber}):`, error);
    throw error;
  }
};

/**
 * Tìm user (bao gồm cả thông tin profile và account) theo AccountID.
 * @param {number} accountId
 * @returns {Promise<object|null>}
 */
const findUserById = async (accountId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, accountId);
    const result = await request.query(`
      SELECT
        a.AccountID,
        a.Email,
        a.RoleID,
        a.Status,
        a.HasSocialLogin,
        a.CreatedAt AS AccountCreatedAt,
        a.UpdatedAt AS AccountUpdatedAt,
        up.FullName,
        up.AvatarUrl,
        up.CoverImageUrl,
        up.Gender,
        up.BirthDate,
        up.PhoneNumber,
        up.Headline,
        up.Location
      FROM Accounts a
      LEFT JOIN UserProfiles up ON a.AccountID = up.AccountID
      WHERE a.AccountID = @AccountID
    `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error in findUserById (${accountId}):`, error);
    throw error;
  }
};

/**
 * Tạo UserProfile mới (trong một transaction).
 * @param {object} profileData - Dữ liệu profile { AccountID, FullName, ... }.
 * @param {object} transaction - Đối tượng transaction từ mssql.
 * @returns {Promise<void>}
 */
const createUserProfileInTransaction = async (profileData, transaction) => {
  const request = transaction.request();
  request.input('AccountID', sql.BigInt, profileData.AccountID);
  request.input('FullName', sql.NVarChar, profileData.FullName);

  await request.query(`
        INSERT INTO UserProfiles (AccountID, FullName)
        VALUES (@AccountID, @FullName);
    `);
};

/**
 * Tìm UserProfile bằng AccountID.
 * @param {number} accountId - ID tài khoản.
 * @returns {Promise<object|null>} - Profile hoặc null.
 */
const findUserProfileById = async (accountId) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, accountId);
    const result = await request.query(`
            SELECT
                up.*,
                a.Email,
                a.RoleID,
                a.Status,
                a.HasSocialLogin,
                a.CreatedAt as AccountCreatedAt,
                a.UpdatedAt as AccountUpdatedAt
            FROM UserProfiles up
            JOIN Accounts a ON up.AccountID = a.AccountID
            WHERE up.AccountID = @AccountID;
        `);
    return result.recordset[0] || null;
  } catch (error) {
    logger.error(`Error in findUserProfileById (${accountId}):`, error);
    throw error;
  }
};

/**
 * Cập nhật UserProfile bằng AccountID.
 * @param {number} accountId - ID tài khoản.
 * @param {object} updateData - Dữ liệu cần cập nhật { FullName, AvatarUrl, ... }.
 * @returns {Promise<number>} - Số dòng bị ảnh hưởng.
 */
const updateUserProfileById = async (accountId, updateData) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, accountId);
    request.input('UpdatedAt', sql.DateTime2, new Date());

    const setClauses = ['UpdatedAt = @UpdatedAt'];
    Object.keys(updateData).forEach((key) => {
      if (key !== 'AccountID' && key !== 'CreatedAt') {
        const value = updateData[key];
        let sqlType;
        if (
          key === 'fullName' ||
          key === 'headline' ||
          key === 'location' ||
          key === 'bankAccountHolderName' ||
          key === 'bankName'
        )
          sqlType = sql.NVarChar;
        else if (
          key === 'avatarUrl' ||
          key === 'coverImageUrl' ||
          key === 'phoneNumber' ||
          key === 'gender' ||
          key === 'bankAccountNumber'
        )
          sqlType = sql.VarChar;
        else if (key === 'birthDate') sqlType = sql.Date;
        else {
          logger.warn(
            `Unhandled key type in updateUserProfileById for key: ${key}`
          );
          return;
        }

        request.input(key, sqlType, value);
        setClauses.push(`${key} = @${key}`);
      }
    });

    if (setClauses.length === 1) {
      logger.warn(
        `updateUserProfileById called for AccountID ${accountId} with no data to update.`
      );
      return 0;
    }

    const query = `
             UPDATE UserProfiles
             SET ${setClauses.join(', ')}
             WHERE AccountID = @AccountID;
        `;

    const result = await request.query(query);
    return result.rowsAffected[0];
  } catch (error) {
    logger.error(`Error updating user profile ${accountId}:`, error);
    throw error;
  }
};

/**
 * Lấy danh sách tài khoản (có phân trang, tìm kiếm - Admin).
 * @param {object} options - { page, limit, searchTerm, role, status }
 * @returns {Promise<{ users: object[], total: number }>}
 */
const findAllAccounts = async (options = {}) => {
  const {
    page = 1,
    limit = 10,
    searchTerm = '',
    role = '',
    status = '',
  } = options;
  const offset = (page - 1) * limit;

  try {
    const pool = await getConnection();
    const request = pool.request();

    const whereClauses = [];
    if (searchTerm) {
      request.input('Search', sql.NVarChar, `%${searchTerm}%`);
      whereClauses.push('(a.Email LIKE @Search OR up.FullName LIKE @Search)');
    }
    if (role) {
      request.input('RoleID', sql.VarChar, role);
      whereClauses.push('a.RoleID = @RoleID');
    }
    if (status) {
      request.input('Status', sql.VarChar, status);
      whereClauses.push('a.Status = @Status');
    }

    const whereCondition =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countResult = await request.query(`
            SELECT COUNT(a.AccountID) as total
            FROM Accounts a
            LEFT JOIN UserProfiles up ON a.AccountID = up.AccountID
            ${whereCondition};
        `);
    const { total } = countResult.recordset[0];

    request.input('Limit', sql.Int, limit);
    request.input('Offset', sql.Int, offset);
    const query = `
    SELECT
        a.AccountID,
        a.Email,
        a.RoleID,
        a.Status,
        a.HasSocialLogin,
        a.CreatedAt AS CreatedAt,
        a.UpdatedAt AS UpdatedAt,
        up.FullName,
        up.AvatarUrl,
        up.CoverImageUrl,
        up.Gender,
        up.BirthDate,
        up.PhoneNumber,
        up.Headline,
        up.Location,
        ip.ProfessionalTitle,
        ip.Bio,
        ip.AboutMe,
        ip.LastBalanceUpdate,
        STRING_AGG(s.SkillName, ', ') AS Skills,
        (
            SELECT STRING_AGG(
                CONCAT('{"methodId":"', pm.MethodID, '","details":', pm.Details, ',"isPrimary":', pm.IsPrimary, '}'),
                ','
            )
            FROM InstructorPayoutMethods pm
            WHERE pm.AccountID = a.AccountID
        ) AS BankDetails,
        (
            SELECT STRING_AGG(
                CONCAT('{"platform":"', isl.Platform, '","url":"', isl.Url, '"}'),
                ','
            )
            FROM InstructorSocialLinks isl
            WHERE isl.AccountID = a.AccountID
        ) AS SocialLinks
    FROM Accounts a
    LEFT JOIN UserProfiles up ON a.AccountID = up.AccountID
    LEFT JOIN InstructorProfiles ip ON a.AccountID = ip.AccountID
    LEFT JOIN InstructorSkills iskl ON a.AccountID = iskl.AccountID
    LEFT JOIN Skills s ON iskl.SkillID = s.SkillID
    ${whereCondition}
    GROUP BY
        a.AccountID,
        a.Email,
        a.RoleID,
        a.Status,
        a.HasSocialLogin,
        a.CreatedAt,
        a.UpdatedAt,
        up.FullName,
        up.AvatarUrl,
        up.CoverImageUrl,
        up.Gender,
        up.BirthDate,
        up.PhoneNumber,
        up.Headline,
        up.Location,
        ip.ProfessionalTitle,
        ip.Bio,
        ip.AboutMe,
        ip.LastBalanceUpdate
    ORDER BY a.CreatedAt DESC
    OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
  `;

    const result = await request.query(query);

    const users = result.recordset.map((user) => ({
      ...user,
      BankDetails: user.BankDetails ? JSON.parse(`[${user.BankDetails}]`) : [],
      SocialLinks: user.SocialLinks ? JSON.parse(`[${user.SocialLinks}]`) : [],
    }));

    return { users, total };
  } catch (error) {
    logger.error('Error in findAllAccounts:', error);
    throw error;
  }
};

module.exports = {
  findUserByPhoneNumber,
  findUserById,
  createUserProfileInTransaction,
  findUserProfileById,
  updateUserProfileById,
  findAllAccounts,
};
