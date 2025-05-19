// const httpStatus = require('http-status').status;
// const { getConnection, sql } = require('../../database/connection');
// const logger = require('../../utils/logger');
// const ApiError = require('../../core/errors/ApiError');

// /**
//  * Tạo bản ghi PaymentSplit mới (trong transaction).
//  * @param {object} splitData - { PaymentID, OrderItemID, RecipientAccountID, Amount, PayoutID (null) }
//  * @param {object} transaction
//  * @returns {Promise<object>} - PaymentSplit vừa tạo.
//  */
// const createPaymentSplit = async (splitData, transaction) => {
//   const request = transaction.request();
//   request.input('PaymentID', sql.BigInt, splitData.PaymentID);
//   request.input('OrderItemID', sql.BigInt, splitData.OrderItemID);
//   request.input('RecipientAccountID', sql.BigInt, splitData.RecipientAccountID); // Instructor ID
//   request.input('Amount', sql.Decimal(18, 4), splitData.Amount); // Số tiền GV nhận được
//   // PayoutID ban đầu là NULL

//   try {
//     const result = await request.query(`
//             INSERT INTO PaymentSplits (PaymentID, OrderItemID, RecipientAccountID, Amount)
//             OUTPUT Inserted.*
//             VALUES (@PaymentID, @OrderItemID, @RecipientAccountID, @Amount);
//         `);
//     return result.recordset[0];
//   } catch (error) {
//     logger.error('Error creating payment split:', error);
//     if (error.number === 2627 || error.number === 2601) {
//       // Lỗi unique PaymentID + OrderItemID
//       logger.warn(
//         `Attempt to create duplicate payment split for PaymentID=${splitData.PaymentID}, OrderItemID=${splitData.OrderItemID}`
//       );
//       // Lỗi này không nên xảy ra nếu logic service đúng
//       throw new ApiError(
//         httpStatus.INTERNAL_SERVER_ERROR,
//         'Lỗi khi tạo bản ghi chia sẻ doanh thu (trùng lặp).'
//       );
//     }
//     throw error;
//   }
// };

// /**
//  * Lấy tổng số dư chưa rút của một giảng viên.
//  * @param {number} instructorId
//  * @returns {Promise<number>} - Tổng số dư (Amount từ PaymentSplits WHERE PayoutID IS NULL).
//  */
// const getInstructorAvailableBalance = async (instructorId) => {
//   try {
//     const pool = await getConnection();
//     const request = pool.request();
//     request.input('RecipientAccountID', sql.BigInt, instructorId);
//     // SUM Amount từ các split chưa được thanh toán (PayoutID IS NULL)
//     const result = await request.query(`
//             SELECT ISNULL(SUM(Amount), 0) as availableBalance
//             FROM PaymentSplits
//             WHERE RecipientAccountID = @RecipientAccountID AND PayoutID IS NULL;
//         `);
//     return result.recordset[0].availableBalance;
//   } catch (error) {
//     logger.error(
//       `Error getting available balance for instructor ${instructorId}:`,
//       error
//     );
//     throw error;
//   }
// };

// /**
//  * Lấy danh sách các giao dịch chưa thanh toán của giảng viên (dùng cho việc tạo Payout).
//  * @param {number} instructorId
//  * @param {object} transaction
//  * @returns {Promise<Array<object>>} - Mảng các PaymentSplit chưa có PayoutID.
//  */
// const findUnpaidSplitsByInstructor = async (instructorId, transaction) => {
//   const request = transaction.request(); // Phải chạy trong transaction
//   request.input('RecipientAccountID', sql.BigInt, instructorId);
//   try {
//     // Thêm FOR UPDATE để khóa các dòng này lại, tránh race condition khi tạo payout
//     // Tuy nhiên, cú pháp FOR UPDATE không chuẩn trong SQL Server, dùng WITH (UPDLOCK, ROWLOCK) hoặc tương đương
//     const result = await request.query(`
//             SELECT SplitID, Amount
//             FROM PaymentSplits WITH (UPDLOCK, ROWLOCK) -- Khóa các dòng sẽ được cập nhật
//             WHERE RecipientAccountID = @RecipientAccountID AND PayoutID IS NULL;
//         `);
//     return result.recordset;
//   } catch (error) {
//     logger.error(
//       `Error finding unpaid splits for instructor ${instructorId}:`,
//       error
//     );
//     throw error;
//   }
// };

// /**
//  * Cập nhật PayoutID cho các PaymentSplit (trong transaction).
//  * @param {Array<number>} splitIds - Mảng các SplitID cần cập nhật.
//  * @param {number} payoutId - ID của Payout mới tạo.
//  * @param {object} transaction
//  * @returns {Promise<void>}
//  */
// const linkSplitsToPayout = async (splitIds, payoutId, transaction) => {
//   if (!splitIds || splitIds.length === 0) return;

//   const request = transaction.request();
//   request.input('PayoutID', sql.BigInt, payoutId);

//   // Tạo chuỗi parameter placeholders: @id0, @id1,...
//   const idPlaceholders = splitIds.map((_, index) => `@id${index}`).join(', ');
//   splitIds.forEach((id, index) => request.input(`id${index}`, sql.BigInt, id));

//   try {
//     await request.query(`
//             UPDATE PaymentSplits
//             SET PayoutID = @PayoutID
//             WHERE SplitID IN (${idPlaceholders});
//         `);
//   } catch (error) {
//     logger.error(`Error linking splits to payout ${payoutId}:`, error);
//     throw error;
//   }
// };

// /**
//  * Lấy danh sách chi tiết các khoản doanh thu của giảng viên (phân trang).
//  * Join với OrderItem, Course, Order để hiển thị thông tin hữu ích.
//  * @param {number} instructorId
//  * @param {object} options - { page, limit, payoutStatus ('PAID', 'UNPAID', 'ALL') }
//  * @returns {Promise<{splits: object[], total: number}>}
//  */
// const findInstructorRevenueDetails = async (instructorId, options = {}) => {
//   const { page = 1, limit = 10, payoutStatus = 'ALL' } = options; // ALL, PAID, UNPAID
//   const offset = (page - 1) * limit;

//   try {
//     const pool = await getConnection();
//     const request = pool.request();
//     request.input('RecipientAccountID', sql.BigInt, instructorId);

//     const whereClauses = ['ps.RecipientAccountID = @RecipientAccountID'];
//     if (payoutStatus === 'PAID') {
//       whereClauses.push('ps.PayoutID IS NOT NULL');
//     } else if (payoutStatus === 'UNPAID') {
//       whereClauses.push('ps.PayoutID IS NULL');
//     }
//     const whereCondition = `WHERE ${whereClauses.join(' AND ')}`;

//     const commonJoins = `
//          FROM PaymentSplits ps
//          JOIN OrderItems oi ON ps.OrderItemID = oi.OrderItemID
//          JOIN Orders o ON oi.OrderID = o.OrderID
//          JOIN Courses c ON oi.CourseID = c.CourseID
//          LEFT JOIN Payouts p ON ps.PayoutID = p.PayoutID -- Lấy thông tin Payout nếu đã trả
//      `;
//     const commonQuery = `${commonJoins} ${whereCondition}`;

//     const countResult = await request.query(
//       `SELECT COUNT(ps.SplitID) as total ${commonQuery}`
//     );
//     const { total } = countResult.recordset[0];

//     request.input('Limit', sql.Int, limit);
//     request.input('Offset', sql.Int, offset);
//     const dataResult = await request.query(`
//          SELECT
//              ps.SplitID, ps.Amount, ps.CreatedAt as RevenueDate, ps.PayoutID,
//              oi.OrderItemID, oi.PriceAtOrder as CourseSalePrice,
//              o.OrderID, o.OrderDate,
//              c.CourseID, c.CourseName, c.Slug as CourseSlug,
//              p.PayoutStatusID, p.CompletedAt as PayoutDate
//          ${commonQuery}
//          ORDER BY ps.CreatedAt DESC
//          OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
//      `);

//     return { splits: dataResult.recordset, total };
//   } catch (error) {
//     logger.error(
//       `Error finding revenue details for instructor ${instructorId}:`,
//       error
//     );
//     throw error;
//   }
// };

// module.exports = {
//   createPaymentSplit,
//   getInstructorAvailableBalance,
//   findUnpaidSplitsByInstructor,
//   linkSplitsToPayout,
//   findInstructorRevenueDetails,
// };
