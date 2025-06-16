// File: src/api/admin/admin.service.js

const moment = require('moment');
const adminRepository = require('./admin.repository');
const { toCamelCaseObject } = require('../../utils/caseConverter');
const { createPricingObject } = require('../../utils/pricing.util');

const getDashboardOverview = async (targetCurrency = 'VND') => {
  // Gọi tất cả các hàm lấy dữ liệu đồng thời
  const [stats, monthlyRevenueRaw, recentOrdersRaw, topPerformingCoursesRaw] =
    await Promise.all([
      adminRepository.getDashboardStats(),
      adminRepository.getMonthlyRevenue(),
      adminRepository.getRecentOrders(),
      adminRepository.getTopPerformingCourses(),
    ]);

  // 1. Định dạng lại Stats (convert totalRevenue)
  const totalRevenuePricing = await createPricingObject(
    {
      OriginalPrice: parseFloat(stats.totalRevenue) || 0,
      DiscountedPrice: null,
    },
    targetCurrency
  );
  const formattedStats = {
    totalRevenue: {
      currency: totalRevenuePricing.display.currency,
      amount: totalRevenuePricing.display.originalPrice,
      exchangeRateUsed: totalRevenuePricing.display.exchangeRateUsed,
    },
    totalStudents: stats.totalStudents || 0,
    totalInstructors: stats.totalInstructors || 0,
    totalCourses: stats.totalCourses || 0,
    pendingCourseApprovals: stats.pendingCourseApprovals || 0,
    pendingWithdrawals: stats.pendingWithdrawals || 0,
  };

  // 2. Định dạng lại Monthly Revenue (convert từng tháng)
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
  const monthlyRevenue = [];
  for (let i = 11; i >= 0; i -= 1) {
    const date = moment().subtract(i, 'months');
    const monthKey = date.format('YYYY-MM');
    const monthName = monthNames[date.month()];
    const revenueVND =
      monthlyRevenueRaw.find((item) => item.Month === monthKey)?.Revenue || 0;
    const pricing = await createPricingObject(
      {
        OriginalPrice: parseFloat(revenueVND) || 0,
        DiscountedPrice: null,
      },
      targetCurrency
    );
    monthlyRevenue.push({
      month: monthName,
      revenue: pricing.display.originalPrice,
      currency: pricing.display.currency,
      exchangeRateUsed: pricing.display.exchangeRateUsed,
    });
  }

  // 3. Định dạng lại Recent Orders (convert amount nếu cần)
  const recentOrders = await Promise.all(
    recentOrdersRaw.map(async (order) => {
      let amount;
      let currency;
      let exchangeRateUsed = null;
      if (
        order.CurrencyID &&
        targetCurrency &&
        order.CurrencyID.toUpperCase() === targetCurrency.toUpperCase()
      ) {
        // Không cần convert, giữ nguyên số tiền và currency gốc
        amount = parseFloat(order.FinalAmount) || 0;
        currency = order.CurrencyID;
        exchangeRateUsed = null;
      } else {
        // Convert sang targetCurrency
        const pricing = await createPricingObject(
          {
            OriginalPrice: parseFloat(order.FinalAmount) || 0,
            DiscountedPrice: null,
          },
          targetCurrency
        );
        amount = pricing.display.originalPrice;
        currency = pricing.display.currency;
        exchangeRateUsed = pricing.display.exchangeRateUsed;
      }
      return {
        orderId: order.OrderID,
        userFullName: order.UserFullName,
        userAvatarUrl: order.UserAvatarUrl,
        courseName: order.CourseName,
        amount,
        currency,
        exchangeRateUsed,
        orderDate: order.OrderDate,
      };
    })
  );

  // 4. Định dạng lại Top Performing Courses (convert revenue nếu cần)
  const topPerformingCourses = await Promise.all(
    topPerformingCoursesRaw.map(async (course) => {
      let revenue;
      let currency;
      let exchangeRateUsed = null;
      if (
        course.CurrencyID &&
        targetCurrency &&
        course.CurrencyID.toUpperCase() === targetCurrency.toUpperCase()
      ) {
        // Không cần convert, giữ nguyên số tiền và currency gốc
        revenue = parseFloat(course.TotalRevenue) || 0;
        currency = course.CurrencyID;
        exchangeRateUsed = null;
      } else {
        // Convert sang targetCurrency
        const pricing = await createPricingObject(
          {
            OriginalPrice: parseFloat(course.TotalRevenue) || 0,
            DiscountedPrice: null,
          },
          targetCurrency
        );
        revenue = pricing.display.originalPrice;
        currency = pricing.display.currency;
        exchangeRateUsed = pricing.display.exchangeRateUsed;
      }
      return {
        courseId: course.CourseID,
        courseName: course.CourseName,
        revenue,
        currency,
        exchangeRateUsed,
        slug: course.Slug,
      };
    })
  );

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
