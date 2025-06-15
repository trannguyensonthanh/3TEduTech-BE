const httpStatus = require('http-status').status;
const orderRepository = require('./orders.repository');
const cartService = require('../carts/carts.service');
const cartRepository = require('../carts/carts.repository');
const enrollmentService = require('../enrollments/enrollments.service');
const ApiError = require('../../core/errors/ApiError');
const OrderStatus = require('../../core/enums/OrderStatus');
const logger = require('../../utils/logger');
const { getConnection, sql } = require('../../database/connection');

const courseRepository = require('../courses/courses.repository');
const promotionService = require('../promotions/promotions.service');
const notificationService = require('../notifications/notifications.service');

const balanceTransactionRepository = require('../financials/balanceTransaction.repository');
const settingsService = require('../settings/settings.service');
const Currency = require('../../core/enums/Currency');
const { toCamelCaseObject } = require('../../utils/caseConverter');
const { generateUniqueOrderId } = require('../../utils/generateRandom');

/**
 * Hàm xử lý sau khi thanh toán thành công (sẽ được gọi bởi webhook hoặc callback từ cổng thanh toán).
 * @param {number} orderId - ID đơn hàng đã thanh toán.
 * @param {number} paymentId - ID của bản ghi CoursePayments.
 * @param {object} [transaction=null] - Transaction nếu có.
 * @returns {Promise<void>}
 */
const processSuccessfulOrder = async (
  orderId,
  paymentId,
  transaction = null
) => {
  logger.debug(
    `Processing successful order ${orderId} with payment ${paymentId}.`
  );
  const pool = await getConnection();
  const internalTransaction = transaction || new sql.Transaction(pool);
  const useExternalTransaction = !!transaction;

  try {
    if (!useExternalTransaction) {
      await internalTransaction.begin();
    }

    const orderUpdateData = {
      OrderStatus: OrderStatus.COMPLETED,
      PaymentID: paymentId,
    };
    const updatedOrder = await orderRepository.updateOrderStatusAndPayment(
      orderId,
      orderUpdateData,
      internalTransaction
    );
    if (!updatedOrder) {
      throw new Error(`Order ${orderId} not found or already processed?`);
    }
    if (updatedOrder.OrderStatus === OrderStatus.COMPLETED) {
      logger.warn(`Order ${orderId} has already been processed.`);
    }
    const orderItemsResult = await internalTransaction
      .request()
      .input('OrderID', sql.BigInt, orderId)
      .query(
        'SELECT OrderItemID, CourseID, PriceAtOrder FROM OrderItems WHERE OrderID = @OrderID;'
      );
    const orderItems = orderItemsResult.recordset;

    const commissionRateStr = await settingsService.getSettingValue(
      'PlatformCommissionRate',
      '30.00'
    );
    let platformRate = parseFloat(commissionRateStr) / 100;

    if (Number.isNaN(platformRate) || platformRate < 0 || platformRate > 1) {
      logger.error(
        `Invalid PlatformCommissionRate loaded: ${commissionRateStr}. Defaulting to 30%.`
      );
      platformRate = 0.3;
    }
    for (const item of orderItems) {
      try {
        const course = await courseRepository.findCourseById(
          item.CourseID,
          true
        );
        const instructorId = course?.InstructorID;

        if (instructorId) {
          const instructorShare = item.PriceAtOrder * (1 - platformRate);
          let creditAmount = instructorShare > 0 ? instructorShare : 0;
          let creditCurrency = updatedOrder.CurrencyID || Currency.VND;

          if (creditCurrency !== Currency.VND) {
            const rateResult = await internalTransaction
              .request()
              .input('FromCurrencyID', sql.VarChar(10), creditCurrency)
              .input('ToCurrencyID', sql.VarChar(10), Currency.VND)
              .query(
                'SELECT TOP 1 Rate FROM ExchangeRates WHERE FromCurrencyID = @FromCurrencyID AND ToCurrencyID = @ToCurrencyID ORDER BY EffectiveTimestamp DESC'
              );
            const rate = rateResult.recordset[0]?.Rate;
            if (!rate || Number.isNaN(Number(rate))) {
              logger.error(
                `Không tìm thấy tỉ giá quy đổi từ ${creditCurrency} sang VND. Không cộng tiền cho giảng viên.`
              );
            } else {
              creditAmount *= parseFloat(rate);
              creditCurrency = Currency.VND;
            }
          }

          if (creditAmount > 0 && creditCurrency === Currency.VND) {
            const previousBalance =
              await balanceTransactionRepository.getCurrentBalance(
                instructorId,
                internalTransaction
              );
            const newBalance = previousBalance + creditAmount;

            await balanceTransactionRepository.createBalanceTransaction(
              {
                AccountID: instructorId,
                Type: 'CREDIT_SALE',
                Amount: creditAmount,
                CurrencyID: creditCurrency,
                CurrentBalance: newBalance,
                RelatedEntityType: 'OrderItem',
                RelatedEntityID: item.OrderItemID,
                PaymentID: paymentId,
                Description: `Doanh thu từ khóa học "${course.CourseName || 'N/A'}" (ĐH #${orderId}, Item #${item.OrderItemID})`,
              },
              internalTransaction
            );
          }
        }

        const enrollment = await enrollmentService.createEnrollment(
          updatedOrder.AccountID,
          item.CourseID,
          item.PriceAtOrder,
          internalTransaction
        );

        await orderRepository.linkOrderItemToEnrollment(
          item.OrderItemID,
          enrollment.EnrollmentID,
          internalTransaction
        );
      } catch (itemError) {
        if (
          itemError instanceof ApiError &&
          itemError.statusCode === httpStatus.BAD_REQUEST &&
          itemError.message.includes('đã đăng ký')
        ) {
          logger.warn(
            `Order ${orderId}: User ${updatedOrder.AccountID} already enrolled in course ${item.CourseID}. Skipping.`
          );
        } else {
          logger.error(
            `Error processing OrderItem ${item.OrderItemID} for Order ${orderId}:`,
            itemError
          );
          throw itemError;
        }
      }
    }

    if (!useExternalTransaction) {
      await internalTransaction.commit();
    }
    logger.info(
      `Order ${orderId} processed successfully after payment ${paymentId}. Enrollments and Splits created.`
    );
    try {
      const messageUser = `Đơn hàng #${orderId} của bạn đã hoàn tất. Bạn có thể bắt đầu học ngay!`;
      await notificationService.createNotification(
        updatedOrder.AccountID,
        'ORDER_COMPLETED',
        messageUser,
        { type: 'Order', id: orderId.toString() }
      );
    } catch (notifyError) {
      logger.error(
        `Failed to send notification for successful order ${orderId}:`,
        notifyError
      );
    }

    try {
      const instructorsToNotify = new Map();

      for (const item of orderItems) {
        const course = await courseRepository.findCourseById(
          item.CourseID,
          true
        );
        if (course && course.InstructorID) {
          if (!instructorsToNotify.has(course.InstructorID)) {
            instructorsToNotify.set(course.InstructorID, []);
          }
          instructorsToNotify.get(course.InstructorID).push(course.CourseName);
        }
      }

      for (const [instructorId, courseNames] of instructorsToNotify.entries()) {
        const messageInstructor = `Chúc mừng! Các khóa học của bạn (${courseNames.join(
          ', '
        )}) vừa được bán trong đơn hàng #${orderId}.`;
        await notificationService.createNotification(
          instructorId,
          'COURSE_SOLD',
          messageInstructor,
          { type: 'Order', id: orderId.toString() }
        );
      }
    } catch (notifyError) {
      logger.error(
        `Failed to send course sold notification for order ${orderId}:`,
        notifyError
      );
    }
  } catch (error) {
    logger.error(
      `Error processing successful order ${orderId} with payment ${paymentId}:`,
      error
    );
    if (!useExternalTransaction) {
      await internalTransaction.rollback();
    }
  }
};

/**
 * Tạo đơn hàng từ giỏ hàng của người dùng.
 * @param {number} accountId
 * @param {object} [options={}] - { promotionCode } (sẽ dùng sau)
 * @returns {Promise<object>} - Đơn hàng vừa tạo với chi tiết items.
 */
const createOrderFromCart = async (accountId, options = {}) => {
  const { promotionCode, currency } = options;
  console.log('Promotion code:', promotionCode);
  const cartDetails = await cartService.viewCart(accountId, currency);
  if (cartDetails.items.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Giỏ hàng của bạn đang trống.');
  }

  const originalTotalPrice = cartDetails.summary.totalOriginalPrice;
  const basePriceBeforePromo = cartDetails.summary.finalPrice;
  let calculatedPromoDiscountAmount = 0;
  let promotionId = null;
  if (promotionCode) {
    try {
      const promoResult = await promotionService.validateAndApplyPromotion(
        promotionCode,
        basePriceBeforePromo
      );

      console.log(`Promotion code ${promotionCode} applied:`, promoResult);
      calculatedPromoDiscountAmount = promoResult.discountAmount;
      promotionId = promoResult.promotionId;
    } catch (promoError) {
      if (promoError instanceof ApiError) {
        throw new ApiError(promoError.statusCode, promoError.message);
      } else {
        logger.error(
          `Unexpected error validating promotion ${promotionCode}:`,
          promoError
        );
        throw new ApiError(
          httpStatus.INTERNAL_SERVER_ERROR,
          'Lỗi khi kiểm tra mã giảm giá.'
        );
      }
    }
  }
  const finalAmount = Math.max(
    0,
    basePriceBeforePromo - calculatedPromoDiscountAmount
  );
  const orderDiscountAmount = calculatedPromoDiscountAmount;
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    const orderData = {
      AccountID: accountId,
      OriginalTotalPrice: originalTotalPrice,
      DiscountAmount: orderDiscountAmount,
      FinalAmount: finalAmount,
      CurrencyID: currency,
      PromotionID: promotionId,
      OrderStatus:
        finalAmount > 0 ? OrderStatus.PENDING_PAYMENT : OrderStatus.COMPLETED,
    };
    const newOrder = await orderRepository.createOrder(orderData, transaction);
    const orderId = newOrder.OrderID;

    const orderItemsData = cartDetails.items.map((item) => {
      const priceAtOrder =
        item.pricing.display.discountedPrice ??
        item.pricing.display.originalPrice;

      return {
        CourseID: item.courseId,
        PriceAtOrder: priceAtOrder,
      };
    });
    await orderRepository.createOrderItems(
      orderId,
      orderItemsData,
      transaction
    );

    if (promotionId) {
      await promotionService.incrementUsageCount(promotionId, transaction);
    }

    await cartRepository.clearCart(cartDetails.cartId, transaction);
    if (finalAmount <= 0) {
      logger.info(`Processing free order ${newOrder.OrderID} immediately.`);
      await processSuccessfulOrder(newOrder.OrderID, null, transaction);
    }
    await transaction.commit();

    logger.info(
      `Order ${orderId} created with promotion ${
        promotionCode || 'N/A'
      } for user ${accountId}.`
    );
    const orderDetails =
      await orderRepository.findOrderByIdWithDetails(orderId);
    return toCamelCaseObject(orderDetails);
  } catch (error) {
    logger.error(
      `Error creating order with promotion ${promotionCode} for user ${accountId}:`,
      error
    );
    await transaction.rollback();
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Tạo đơn hàng thất bại.'
    );
  }
};

/**
 * Lấy danh sách đơn hàng của người dùng hiện tại.
 * @param {number} accountId
 * @param {object} options - { page, limit, status }
 * @returns {Promise<object>}
 */
const getMyOrders = async (accountId, options) => {
  const { page = 1, limit = 10, status } = options;
  const result = await orderRepository.findOrdersByAccountId(accountId, {
    page,
    limit,
    status,
  });
  return {
    orders: toCamelCaseObject(result.orders),
    total: result.total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalPages: Math.ceil(result.total / limit),
  };
};

/**
 * Lấy chi tiết đơn hàng của người dùng hiện tại.
 * Đã cập nhật để trả về chi tiết đầy đủ cho từng item và áp dụng cấu trúc pricing.
 * @param {number} accountId
 * @param {number} orderId
 * @returns {Promise<object>}
 */
const getMyOrderDetails = async (accountId, orderId) => {
  const order = await orderRepository.findOrderByIdWithDetails(orderId);

  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy đơn hàng.');
  }
  if (order.AccountID !== accountId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn không có quyền xem đơn hàng này.'
    );
  }

  const itemsWithPricing = await Promise.all(
    order.items.map(async (item) => {
      const pricing = {
        base: {
          currency: order.CurrencyID,
          price: parseFloat(item.PriceAtOrder.toString()),
        },
        display: {
          currency: order.CurrencyID,
          price: parseFloat(item.PriceAtOrder.toString()),
        },
      };

      return {
        orderItemId: item.OrderItemID,
        courseId: item.CourseID,
        courseName: item.CourseName,
        slug: item.Slug,
        thumbnailUrl: item.ThumbnailUrl,
        instructorName: item.InstructorName,
        enrollmentId: item.EnrollmentID,
        pricing,
      };
    })
  );

  order.items = itemsWithPricing;

  return toCamelCaseObject(order);
};

module.exports = {
  createOrderFromCart,
  processSuccessfulOrder,
  getMyOrders,
  getMyOrderDetails,
};
