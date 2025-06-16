// File: src/api/admin/admin.repository.js

const { getConnection, sql } = require('../../database/connection');
const logger = require('../../utils/logger');
const Roles = require('../../core/enums/Roles');
const OrderStatus = require('../../core/enums/OrderStatus');
const ApprovalStatus = require('../../core/enums/ApprovalStatus');
const WithdrawalStatus = require('../../core/enums/WithdrawalStatus');

/**
 * Lấy các số liệu thống kê chính cho dashboard.
 */
const getDashboardStats = async () => {
  try {
    const pool = await getConnection();
    const request = pool.request();

    // Sử dụng CTEs (Common Table Expressions) để tính toán từng phần riêng biệt
    const query = `
        WITH RevenueCTE AS (
            SELECT ISNULL(SUM(FinalAmount), 0) as TotalRevenue
            FROM Orders
            WHERE OrderStatus = @CompletedStatus
        ),
        StudentCTE AS (
            SELECT COUNT(AccountID) as TotalStudents
            FROM Accounts
            WHERE RoleID = @StudentRole
        ),
        InstructorCTE AS (
            SELECT COUNT(AccountID) as TotalInstructors
            FROM Accounts
            WHERE RoleID = @InstructorRole
        ),
        CourseCTE AS (
            SELECT COUNT(CourseID) as TotalCourses
            FROM Courses
        ),
        ApprovalCTE AS (
            SELECT COUNT(RequestID) as PendingApprovals
            FROM CourseApprovalRequests
            WHERE Status = @PendingApprovalStatus
        ),
        WithdrawalCTE AS (
            SELECT COUNT(RequestID) as PendingWithdrawals
            FROM WithdrawalRequests
            WHERE Status = @PendingWithdrawalStatus
        )
        SELECT 
            (SELECT TotalRevenue FROM RevenueCTE) as totalRevenue,
            (SELECT TotalStudents FROM StudentCTE) as totalStudents,
            (SELECT TotalInstructors FROM InstructorCTE) as totalInstructors,
            (SELECT TotalCourses FROM CourseCTE) as totalCourses,
            (SELECT PendingApprovals FROM ApprovalCTE) as pendingCourseApprovals,
            (SELECT PendingWithdrawals FROM WithdrawalCTE) as pendingWithdrawals;
    `;

    request.input('CompletedStatus', sql.VarChar, OrderStatus.COMPLETED);
    request.input('StudentRole', sql.VarChar, Roles.STUDENT);
    request.input('InstructorRole', sql.VarChar, Roles.INSTRUCTOR);
    request.input('PendingApprovalStatus', sql.VarChar, ApprovalStatus.PENDING);
    request.input(
      'PendingWithdrawalStatus',
      sql.VarChar,
      WithdrawalStatus.PENDING
    );

    const result = await request.query(query);
    return result.recordset[0];
  } catch (error) {
    logger.error('Error fetching dashboard stats:', error);
    throw error;
  }
};

/**
 * Lấy dữ liệu doanh thu theo tháng cho 12 tháng gần nhất.
 */
const getMonthlyRevenue = async () => {
  try {
    const pool = await getConnection();
    const request = pool.request();

    // Lấy ngày đầu tiên của 11 tháng trước
    const date = new Date();
    date.setMonth(date.getMonth() - 11);
    date.setDate(1);
    date.setHours(0, 0, 0, 0);

    request.input('StartDate', sql.DateTime, date);
    request.input('CompletedStatus', sql.VarChar, OrderStatus.COMPLETED);

    // Nhóm theo Năm và Tháng
    const query = `
        SELECT
            FORMAT(OrderDate, 'yyyy-MM') as Month,
            SUM(FinalAmount) as Revenue
        FROM Orders
        WHERE OrderStatus = @CompletedStatus AND OrderDate >= @StartDate
        GROUP BY FORMAT(OrderDate, 'yyyy-MM')
        ORDER BY Month ASC;
    `;

    const result = await request.query(query);
    return result.recordset;
  } catch (error) {
    logger.error('Error fetching monthly revenue:', error);
    throw error;
  }
};

/**
 * Lấy 5 đơn hàng hoàn thành gần đây nhất.
 */
const getRecentOrders = async () => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CompletedStatus', sql.VarChar, OrderStatus.COMPLETED);

    // Lấy 1 khóa học đầu tiên trong đơn hàng để hiển thị
    const query = `
        WITH RecentOrdersCTE AS (
            SELECT TOP 5
                o.OrderID,
                o.AccountID,
                o.FinalAmount,
                o.CurrencyID,
                o.OrderDate,
                (SELECT TOP 1 CourseID FROM OrderItems oi WHERE oi.OrderID = o.OrderID) as FirstCourseID
            FROM Orders o
            WHERE o.OrderStatus = @CompletedStatus
            ORDER BY o.OrderDate DESC
        )
        SELECT 
            ro.OrderID,
            ro.FinalAmount,
            ro.CurrencyID,
            ro.OrderDate,
            up.FullName as UserFullName,
            up.AvatarUrl as UserAvatarUrl,
            c.CourseName
        FROM RecentOrdersCTE ro
        JOIN UserProfiles up ON ro.AccountID = up.AccountID
        JOIN Courses c ON ro.FirstCourseID = c.CourseID
        ORDER BY ro.OrderDate DESC;
    `;

    const result = await request.query(query);
    return result.recordset;
  } catch (error) {
    logger.error('Error fetching recent orders:', error);
    throw error;
  }
};

/**
 * Lấy top 5 khóa học có doanh thu cao nhất.
 */
const getTopPerformingCourses = async () => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input('CompletedStatus', sql.VarChar, OrderStatus.COMPLETED);

    const query = `
        SELECT TOP 5
            c.CourseID,
            c.CourseName,
            o.CurrencyID,
            SUM(oi.PriceAtOrder) as TotalRevenue,
            c.Slug
        FROM OrderItems oi
        JOIN Courses c ON oi.CourseID = c.CourseID
        JOIN Orders o ON oi.OrderID = o.OrderID
        WHERE o.OrderStatus = @CompletedStatus
        GROUP BY c.CourseID, c.CourseName, c.Slug, o.CurrencyID
        ORDER BY TotalRevenue DESC;
    `;

    const result = await request.query(query);
    return result.recordset;
  } catch (error) {
    logger.error('Error fetching top performing courses:', error);
    throw error;
  }
};

module.exports = {
  getDashboardStats,
  getMonthlyRevenue,
  getRecentOrders,
  getTopPerformingCourses,
};
