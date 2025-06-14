// File: src/api/admin/admin.service.js

const moment = require('moment');
const adminRepository = require('./admin.repository');
const { toCamelCaseObject } = require('../../utils/caseConverter');

const getDashboardOverview = async () => {
  // Gọi tất cả các hàm lấy dữ liệu đồng thời
  const [stats, monthlyRevenueRaw, recentOrdersRaw, topPerformingCoursesRaw] =
    await Promise.all([
      adminRepository.getDashboardStats(),
      adminRepository.getMonthlyRevenue(),
      adminRepository.getRecentOrders(),
      adminRepository.getTopPerformingCourses(),
    ]);

  // 1. Định dạng lại Stats
  const formattedStats = {
    totalRevenue: {
      currency: 'VND',
      amount: parseFloat(stats.totalRevenue) || 0,
    },
    totalStudents: stats.totalStudents || 0,
    totalInstructors: stats.totalInstructors || 0,
    totalCourses: stats.totalCourses || 0,
    pendingCourseApprovals: stats.pendingCourseApprovals || 0,
    pendingWithdrawals: stats.pendingWithdrawals || 0,
  };

  // 2. Định dạng lại Monthly Revenue
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const revenueMap = new Map(
    monthlyRevenueRaw.map((item) => [item.Month, parseFloat(item.Revenue)])
  );
  const monthlyRevenue = [];
  for (let i = 11; i >= 0; i -= 1) {
    const date = moment().subtract(i, 'months');
    const monthKey = date.format('YYYY-MM');
    const monthName = monthNames[date.month()];
    monthlyRevenue.push({
      month: monthName,
      revenue: revenueMap.get(monthKey) || 0,
    });
  }

  // 3. Định dạng lại Recent Orders
  const recentOrders = recentOrdersRaw.map((order) => ({
    orderId: order.OrderID,
    userFullName: order.UserFullName,
    userAvatarUrl: order.UserAvatarUrl,
    courseName: order.CourseName,
    amount: parseFloat(order.FinalAmount),
    currency: order.CurrencyID,
    orderDate: order.OrderDate,
  }));

  // 4. Định dạng lại Top Performing Courses
  const topPerformingCourses = topPerformingCoursesRaw.map((course) => ({
    courseId: course.CourseID,
    courseName: course.CourseName,
    revenue: parseFloat(course.TotalRevenue),
    currency: 'VND', // Doanh thu tính bằng VND
  }));

  // Lắp ráp kết quả cuối cùng
  return {
    stats: formattedStats,
    monthlyRevenue,
    recentOrders,
    topPerformingCourses,
  };
};

module.exports = {
  getDashboardOverview,
};
