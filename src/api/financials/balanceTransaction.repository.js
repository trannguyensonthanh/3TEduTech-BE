const { isNaN } = require('lodash');
const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');
const OrderStatus = require('../../core/enums/OrderStatus');

/**
 * Lấy số dư hiện tại của instructor từ giao dịch cuối cùng.
 * @param {number} accountId
 * @param {object} [transaction=null]
 * @returns {Promise<number>} - Số dư hiện tại.
 */
const getCurrentBalance = async (accountId, transaction = null) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('AccountID', sql.BigInt, accountId);
  try {
    const result = await executor.query(`
            SELECT TOP 1 CurrentBalance
            FROM InstructorBalanceTransactions
            WHERE AccountID = @AccountID
            ORDER BY TransactionTimestamp DESC, TransactionID DESC;
        `);
    return result.recordset[0]
      ? parseFloat(result.recordset[0].CurrentBalance.toString())
      : 0;
  } catch (error) {
    logger.error(
      `Error getting current balance for account ${accountId}:`,
      error
    );
    throw error;
  }
};

/**
 * Tạo bản ghi giao dịch số dư mới (trong transaction).
 * @param {object} transactionData - { AccountID, Type, Amount, CurrencyID, CurrentBalance, RelatedEntityType, RelatedEntityID, Description, PaymentID?, OrderItemID? }
 * @param {object} transaction
 * @returns {Promise<object>} - Bản ghi transaction vừa tạo.
 */
const createBalanceTransaction = async (transactionData, transaction) => {
  const request = transaction.request();
  request.input('AccountID', sql.BigInt, transactionData.AccountID);
  request.input('Type', sql.VarChar, transactionData.Type);
  request.input('Amount', sql.Decimal(18, 4), transactionData.Amount);
  request.input('CurrencyID', sql.VarChar, transactionData.CurrencyID);
  request.input(
    'CurrentBalance',
    sql.Decimal(18, 4),
    transactionData.CurrentBalance
  );
  request.input(
    'RelatedEntityType',
    sql.VarChar,
    transactionData.RelatedEntityType
  );
  request.input('RelatedEntityID', sql.BigInt, transactionData.RelatedEntityID);
  request.input('Description', sql.NVarChar, transactionData.Description);
  request.input('PaymentID', sql.BigInt, transactionData.PaymentID);
  request.input('OrderItemID', sql.BigInt, transactionData.OrderItemID);

  try {
    const result = await request.query(`
            INSERT INTO InstructorBalanceTransactions (
                AccountID, Type, Amount, CurrencyID, CurrentBalance,
                RelatedEntityType, RelatedEntityID, Description,
                PaymentID, OrderItemID
            )
            OUTPUT Inserted.*
            VALUES (
                @AccountID, @Type, @Amount, @CurrencyID, @CurrentBalance,
                @RelatedEntityType, @RelatedEntityID, @Description,
                @PaymentID, @OrderItemID
            );
        `);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error creating balance transaction:', error);
    throw error;
  }
};

/**
 * Lấy lịch sử giao dịch số dư của giảng viên (phân trang, có thể join chi tiết).
 * @param {number} accountId - Instructor's AccountID.
 * @param {object} options - { page, limit, type, startDate, endDate }
 * @returns {Promise<{transactions: object[], total: number}>}
 */
const findInstructorTransactions = async (accountId, options = {}) => {
  const {
    page = 1,
    limit = 20,
    type = null,
    startDate = null,
    endDate = null,
  } = options;
  const offset = (page - 1) * limit;

  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, accountId);

    let selectFields = `
            ibt.TransactionID, ibt.AccountID as InstructorAccountID, ibt.Type, ibt.Amount, ibt.CurrencyID,
            ibt.CurrentBalance, ibt.RelatedEntityType, ibt.RelatedEntityID,
            ibt.Description as TransactionDescription, ibt.TransactionTimestamp,
            ibt.PaymentID as SourcePaymentID, ibt.OrderItemID as SourceOrderItemID
        `;

    let fromJoins = `
            FROM InstructorBalanceTransactions ibt
        `;

    selectFields += `
            ,oi.PriceAtOrder as OrderItemPriceAtOrder
            ,c.CourseID, c.CourseName, c.Slug as CourseSlug
            ,o.OrderID, o.OrderDate, o.PaymentID
            ,cust_acc.Email as CustomerEmail
            ,p_out.Amount as PayoutAmount, p_out.PayoutStatusID, p_out.CompletedAt as PayoutCompletedDate,
             pm_payout.MethodName as PayoutMethodName
            ,cp.PaymentStatusID as CoursePaymentStatusID
        `;
    fromJoins += `
            LEFT JOIN OrderItems oi ON ibt.OrderItemID = oi.OrderItemID AND ibt.Type = 'CREDIT_SALE'
            LEFT JOIN Courses c ON oi.CourseID = c.CourseID
            LEFT JOIN Orders o ON oi.OrderID = o.OrderID
            LEFT JOIN Accounts cust_acc ON o.AccountID = cust_acc.AccountID
            LEFT JOIN Payouts p_out ON ibt.RelatedEntityID = p_out.PayoutID AND ibt.RelatedEntityType = 'Payout'
            LEFT JOIN PaymentMethods pm_payout ON p_out.PaymentMethodID = pm_payout.MethodID
            LEFT JOIN CoursePayments cp ON o.PaymentID = cp.PaymentID
        `;

    const whereClauses = ['ibt.AccountID = @AccountID'];
    if (type && type !== 'ALL') {
      request.input('TypeFilter', sql.VarChar, type);
      whereClauses.push('ibt.Type = @TypeFilter');
    }
    if (startDate) {
      request.input('StartDate', sql.DateTime2, new Date(startDate));
      whereClauses.push('ibt.TransactionTimestamp >= @StartDate');
    }
    if (endDate) {
      const inclusiveEndDate = new Date(endDate);
      inclusiveEndDate.setDate(inclusiveEndDate.getDate() + 1);
      request.input('EndDate', sql.DateTime2, inclusiveEndDate);
      whereClauses.push('ibt.TransactionTimestamp < @EndDate');
    }

    const whereCondition = `WHERE ${whereClauses.join(' AND ')}`;
    const commonQueryStructure = `${fromJoins} ${whereCondition}`;

    const countResult = await request.query(
      `SELECT COUNT(DISTINCT ibt.TransactionID) as total ${commonQueryStructure}`
    );
    const { total } = countResult.recordset[0];

    request.input('Limit', sql.Int, limit);
    request.input('Offset', sql.Int, offset);

    const orderByClause =
      'ORDER BY ibt.TransactionTimestamp DESC, ibt.TransactionID DESC';

    const dataResult = await request.query(`
            SELECT ${selectFields}
            ${commonQueryStructure}
            ${orderByClause}
            OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
        `);

    return { transactions: dataResult.recordset, total };
  } catch (error) {
    logger.error(
      `Error finding instructor transactions for account ${accountId}:`,
      error
    );
    throw error;
  }
};

/**
 * Tính tổng doanh thu trọn đời của giảng viên (chỉ CREDIT_SALE).
 * @param {number} accountId - Instructor's AccountID.
 * @param {object} [transaction=null]
 * @returns {Promise<number>}
 */
const getTotalLifetimeEarnings = async (accountId, transaction = null) => {
  const executor = transaction
    ? transaction.request()
    : (await getConnection()).request();
  executor.input('AccountID', sql.BigInt, accountId);
  executor.input('CreditSaleType', sql.VarChar, 'CREDIT_SALE');
  try {
    const result = await executor.query(`
            SELECT ISNULL(SUM(Amount), 0) as totalEarnings
            FROM InstructorBalanceTransactions
            WHERE AccountID = @AccountID AND Type = @CreditSaleType;
        `);
    return result.recordset[0].totalEarnings;
  } catch (error) {
    logger.error(
      `Error getting total lifetime earnings for account ${accountId}:`,
      error
    );
    throw error;
  }
};

/**
 * Lấy lịch sử thu nhập ròng (net earnings) của giảng viên theo tháng.
 * @param {number} accountId - Instructor's AccountID.
 * @param {object} options - { periodType ('last_6_months', 'last_12_months', 'year_YYYY', 'all_time'), courseId (optional) }
 * @returns {Promise<Array<{month: string, netEarnings: number}>>}
 */
const getMonthlyNetEarnings = async (accountId, options = {}) => {
  const { periodType = 'last_12_months', courseId = null } = options;

  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, accountId);
    request.input('CreditSaleType', sql.VarChar, 'CREDIT_SALE');

    let dateFilterCondition = '';
    const now = new Date();
    let startDate;

    switch (periodType) {
      case 'last_6_months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        request.input('StartDate', sql.DateTime2, startDate);
        dateFilterCondition = 'AND ibt.TransactionTimestamp >= @StartDate';
        break;
      case 'last_12_months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        request.input('StartDate', sql.DateTime2, startDate);
        dateFilterCondition = 'AND ibt.TransactionTimestamp >= @StartDate';
        break;
      case 'all_time':
        break;
      default:
        if (periodType.startsWith('year_')) {
          const year = parseInt(periodType.split('_')[1], 10);
          if (!isNaN(year) && year > 1900 && year < 2200) {
            request.input('YearStart', sql.DateTime2, new Date(year, 0, 1));
            request.input('YearEnd', sql.DateTime2, new Date(year + 1, 0, 1));
            dateFilterCondition =
              'AND ibt.TransactionTimestamp >= @YearStart AND ibt.TransactionTimestamp < @YearEnd';
          } else {
            startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
            request.input('StartDate', sql.DateTime2, startDate);
            dateFilterCondition = 'AND ibt.TransactionTimestamp >= @StartDate';
          }
        } else {
          startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
          request.input('StartDate', sql.DateTime2, startDate);
          dateFilterCondition = 'AND ibt.TransactionTimestamp >= @StartDate';
        }
        break;
    }

    let courseFilterCondition = '';
    if (courseId) {
      request.input('CourseID', sql.BigInt, courseId);
      courseFilterCondition = 'AND oi.CourseID = @CourseID';
    }

    const query = `
            SELECT
                FORMAT(ibt.TransactionTimestamp, 'yyyy-MM') as Month,
                ISNULL(SUM(ibt.Amount), 0) as NetEarnings
            FROM InstructorBalanceTransactions ibt
            ${courseId ? "JOIN OrderItems oi ON ibt.OrderItemID = oi.OrderItemID AND ibt.RelatedEntityType = 'OrderItem'" : ''}
            WHERE ibt.AccountID = @AccountID AND ibt.Type = @CreditSaleType
                  ${dateFilterCondition}
                  ${courseFilterCondition}
            GROUP BY FORMAT(ibt.TransactionTimestamp, 'yyyy-MM')
            ORDER BY Month ASC;
        `;

    const result = await request.query(query);
    return result.recordset.map((row) => ({
      month: row.Month,
      netEarnings: parseFloat(row.NetEarnings.toString()),
    }));
  } catch (error) {
    logger.error(
      `Error getting monthly net earnings for account ${accountId}:`,
      error
    );
    throw error;
  }
};

/**
 * Lấy tổng doanh thu (total revenue trước khi chia) theo tháng cho giảng viên.
 * Cần join phức tạp hơn để lấy PriceAtOrder.
 * @param {number} accountId
 * @param {object} options - { periodType, courseId }
 * @returns {Promise<Array<{month: string, totalRevenue: number}>>}
 */
const getMonthlyTotalRevenue = async (accountId, options = {}) => {
  const { periodType = 'last_12_months', courseId = null } = options;
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('AccountID', sql.BigInt, accountId);

    let dateFilterCondition = '';
    const now = new Date();
    let startDate;
    switch (periodType) {
      case 'last_6_months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        break;
      case 'last_12_months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        break;
      case 'all_time':
        break;
      default:
        if (periodType.startsWith('year_')) {
          const year = parseInt(periodType.split('_')[1], 10);
          if (!isNaN(year) && year > 1900 && year < 2200) {
            request.input('YearStart', sql.DateTime2, new Date(year, 0, 1));
            request.input('YearEnd', sql.DateTime2, new Date(year + 1, 0, 1));
            dateFilterCondition =
              'AND o.OrderDate >= @YearStart AND o.OrderDate < @YearEnd';
          } else {
            startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
          }
        } else {
          startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        }
        break;
    }
    if (startDate && !dateFilterCondition.includes('@YearStart')) {
      request.input('StartDate', sql.DateTime2, startDate);
      dateFilterCondition = 'AND o.OrderDate >= @StartDate';
    }

    let courseFilterCondition = '';
    if (courseId) {
      request.input('CourseID', sql.BigInt, courseId);
      courseFilterCondition = 'AND oi.CourseID = @CourseID';
    }

    const query = `
            SELECT
                FORMAT(o.OrderDate, 'yyyy-MM') as Month,
                ISNULL(SUM(oi.PriceAtOrder), 0) as TotalRevenue
            FROM OrderItems oi
            JOIN Orders o ON oi.OrderID = o.OrderID
            JOIN Courses c ON oi.CourseID = c.CourseID
            WHERE c.InstructorID = @AccountID
                  ${dateFilterCondition}
                  ${courseFilterCondition}
                  AND o.OrderStatus = '${OrderStatus.COMPLETED}'
            GROUP BY FORMAT(o.OrderDate, 'yyyy-MM')
            ORDER BY Month ASC;
        `;
    const result = await request.query(query);
    return result.recordset.map((row) => ({
      month: row.Month,
      totalRevenue: parseFloat(row.TotalRevenue.toString()),
    }));
  } catch (error) {
    logger.error(
      `Error getting monthly total revenue for instructor ${accountId}:`,
      error
    );
    throw error;
  }
};

/**
 * Lấy phân tích doanh thu theo từng khóa học cho giảng viên.
 * @param {number} accountId - Instructor's AccountID.
 * @param {object} options - { periodType ('last_6_months', 'last_12_months', 'year_YYYY', 'all_time') }
 * @returns {Promise<Array<object>>}
 *  Mảng các object: { CourseID, CourseName, TotalSalesCount, TotalRevenue, NetEarnings }
 */
const getRevenueByCourse = async (accountId, options = {}) => {
  const { periodType = 'last_12_months' } = options;

  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('InstructorID', sql.BigInt, accountId);
    request.input('CreditSaleType', sql.VarChar, 'CREDIT_SALE');
    request.input('CompletedOrderStatus', sql.VarChar, OrderStatus.COMPLETED);

    let dateFilterCondition = '';
    const now = new Date();
    let startDate;

    switch (periodType) {
      case 'last_6_months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        request.input('StartDate', sql.DateTime2, startDate);
        dateFilterCondition = 'AND o.OrderDate >= @StartDate';
        break;
      case 'last_12_months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        request.input('StartDate', sql.DateTime2, startDate);
        dateFilterCondition = 'AND o.OrderDate >= @StartDate';
        break;
      case 'all_time':
        break;
      default:
        if (periodType.startsWith('year_')) {
          const year = parseInt(periodType.split('_')[1], 10);
          if (!isNaN(year) && year > 1900 && year < 2200) {
            request.input('YearStart', sql.DateTime2, new Date(year, 0, 1));
            request.input('YearEnd', sql.DateTime2, new Date(year + 1, 0, 1));
            dateFilterCondition =
              'AND o.OrderDate >= @YearStart AND o.OrderDate < @YearEnd';
          } else {
            startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
            request.input('StartDate', sql.DateTime2, startDate);
            dateFilterCondition = 'AND o.OrderDate >= @StartDate';
          }
        } else {
          startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
          request.input('StartDate', sql.DateTime2, startDate);
          dateFilterCondition = 'AND o.OrderDate >= @StartDate';
        }
        break;
    }

    const query = `
            SELECT
                c.CourseID,
                c.CourseName,
                COUNT(DISTINCT o.OrderID) as TotalSalesCount,
                ISNULL(SUM(oi.PriceAtOrder), 0) as TotalRevenue,
                ISNULL(SUM(CASE WHEN ibt.Type = @CreditSaleType THEN ibt.Amount ELSE 0 END), 0) as NetEarnings
            FROM Courses c
            JOIN OrderItems oi ON c.CourseID = oi.CourseID
            JOIN Orders o ON oi.OrderID = o.OrderID
            LEFT JOIN InstructorBalanceTransactions ibt ON oi.OrderItemID = ibt.RelatedEntityID
                                                        AND ibt.RelatedEntityType = 'OrderItem'
                                                        AND ibt.AccountID = @InstructorID
                                                        AND ibt.Type = @CreditSaleType
            WHERE c.InstructorID = @InstructorID
                  AND o.OrderStatus = @CompletedOrderStatus
                  ${dateFilterCondition}
            GROUP BY c.CourseID, c.CourseName
            ORDER BY NetEarnings DESC, TotalRevenue DESC;
        `;

    const result = await request.query(query);
    return result.recordset.map((row) => ({
      courseId: row.CourseID,
      courseName: row.CourseName,
      courseSlug: row.CourseSlug,
      totalSalesCount: row.TotalSalesCount,
      totalRevenue: parseFloat(row.TotalRevenue.toString()),
      netEarnings: parseFloat(row.NetEarnings.toString()),
    }));
  } catch (error) {
    logger.error(
      `Error getting revenue by course for instructor ${accountId}:`,
      error
    );
    throw error;
  }
};

module.exports = {
  getCurrentBalance,
  createBalanceTransaction,
  findInstructorTransactions,
  getTotalLifetimeEarnings,
  getMonthlyNetEarnings,
  getMonthlyTotalRevenue,
  getRevenueByCourse,
};
