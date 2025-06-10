const httpStatus = require('http-status').status;
const orderRepository = require('./orders.repository');
const cartService = require('../carts/carts.service'); // Để lấy cart items
const cartRepository = require('../carts/carts.repository'); // Để clear cart
const enrollmentService = require('../enrollments/enrollments.service'); // Để tạo enrollment
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
  // Nếu không có transaction ngoài, tạo transaction nội bộ
  const internalTransaction = transaction || new sql.Transaction(pool);
  const useExternalTransaction = !!transaction;

  try {
    if (!useExternalTransaction) {
      await internalTransaction.begin();
    }

    // 1. Cập nhật trạng thái Order thành COMPLETED và liên kết PaymentID
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
    // 2. Lấy các OrderItems của đơn hàng này
    const orderItemsResult = await internalTransaction
      .request()
      .input('OrderID', sql.BigInt, orderId)
      .query(
        'SELECT OrderItemID, CourseID, PriceAtOrder FROM OrderItems WHERE OrderID = @OrderID;'
      );
    const orderItems = orderItemsResult.recordset;

    // Lấy tỷ lệ hoa hồng nền tảng từ Settings
    const commissionRateStr = await settingsService.getSettingValue(
      'PlatformCommissionRate',
      '30.00'
    ); // Có giá trị mặc định
    let platformRate = parseFloat(commissionRateStr) / 100;

    if (Number.isNaN(platformRate) || platformRate < 0 || platformRate > 1) {
      // Dùng Number.isNaN
      logger.error(
        `Invalid PlatformCommissionRate loaded: ${commissionRateStr}. Defaulting to 30%.`
      );
      platformRate = 0.3;
    }
    // 3. Tạo Enrollment và liên kết với OrderItem cho từng item
    for (const item of orderItems) {
      try {
        // Lấy thông tin khóa học
        const course = await courseRepository.findCourseById(
          item.CourseID,
          true
        );
        const instructorId = course?.InstructorID;

        if (instructorId) {
          // Tính toán số tiền giảng viên nhận được
          const instructorShare = item.PriceAtOrder * (1 - platformRate);
          const creditAmount = instructorShare > 0 ? instructorShare : 0;

          if (creditAmount > 0) {
            const previousBalance =
              await balanceTransactionRepository.getCurrentBalance(
                instructorId,
                internalTransaction
              );
            const newBalance = previousBalance + creditAmount;

            // Tạo giao dịch cộng tiền
            await balanceTransactionRepository.createBalanceTransaction(
              {
                AccountID: instructorId,
                Type: 'CREDIT_SALE',
                Amount: creditAmount, // Số dương
                CurrencyID: updatedOrder.OriginalCurrencyID || Currency.VND, // Lấy từ order hoặc default
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

        // Tạo Enrollment
        const enrollment = await enrollmentService.createEnrollment(
          updatedOrder.AccountID,
          item.CourseID,
          item.PriceAtOrder,
          internalTransaction
        );

        // Liên kết OrderItem với Enrollment
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
          throw itemError; // Ném lại lỗi khác để rollback transaction
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
        { type: 'Order', id: orderId.toString() } // Liên kết đến đơn hàng
      );
    } catch (notifyError) {
      logger.error(
        `Failed to send notification for successful order ${orderId}:`,
        notifyError
      );
    }

    // Thông báo cho giảng viên có khóa học được bán
    try {
      const instructorsToNotify = new Map(); // Dùng Map để tránh gửi nhiều lần cho cùng instructor nếu mua nhiều khóa của họ

      for (const item of orderItems) {
        const course = await courseRepository.findCourseById(
          item.CourseID,
          true
        ); // Lấy instructorId
        if (
          course &&
          course.InstructorID &&
          !instructorsToNotify.has(course.InstructorID)
        ) {
          instructorsToNotify.set(course.InstructorID, course.CourseName); // Lưu lại tên khóa học đầu tiên của họ trong đơn
        }
      }

      for (const [instructorId, courseNames] of instructorsToNotify.entries()) {
        const messageInstructor = `Chúc mừng! Các khóa học của bạn (${courseNames.join(
          ', '
        )}) vừa được bán trong đơn hàng #${orderId}.`;
        await notificationService.createNotification(
          instructorId,
          'COURSE_SOLD', // Loại mới
          messageInstructor,
          { type: 'Order', id: orderId.toString() } // Liên kết đến đơn hàng
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
  const { promotionCode, currency } = options; // TODO: Xử lý promotion code sau
  console.log('Promotion code:', promotionCode);
  // 1. Lấy giỏ hàng hiện tại
  const cartDetails = await cartService.viewCart(accountId, currency);
  if (cartDetails.items.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Giỏ hàng của bạn đang trống.');
  }

  // 2. Tính toán giá trị đơn hàng (hiện tại chưa có promotion)
  // 2. Tính toán giá trị ban đầu
  const originalTotalPrice = cartDetails.summary.totalOriginalPrice;
  const basePriceBeforePromo = cartDetails.summary.finalPrice; // Giá sau khi đã trừ discount gốc của khóa học
  // 3. *** ÁP DỤNG PROMOTION CODE (NẾU CÓ) ***
  let calculatedPromoDiscountAmount = 0; // Discount từ promotion code
  let promotionId = null;
  if (promotionCode) {
    try {
      // Validate và lấy thông tin giảm giá
      const promoResult = await promotionService.validateAndApplyPromotion(
        promotionCode,
        basePriceBeforePromo
      );

      console.log(`Promotion code ${promotionCode} applied:`, promoResult);
      calculatedPromoDiscountAmount = promoResult.discountAmount;
      promotionId = promoResult.promotionId;
    } catch (promoError) {
      // Nếu mã không hợp lệ, ném lỗi để báo cho người dùng
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
  // 4. Tính toán lại giá trị cuối cùng
  const finalAmount = Math.max(
    0,
    basePriceBeforePromo - calculatedPromoDiscountAmount
  ); // Đảm bảo không âm
  // Lưu ý: `DiscountAmount` trong Orders có thể lưu tổng discount (gốc + promo) hoặc chỉ promo?
  // Tạm thời lưu discount của promotion code vào đây.
  const orderDiscountAmount = calculatedPromoDiscountAmount;
  // 3. Bắt đầu transaction
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // 6. Tạo bản ghi Order với thông tin đã tính toán
    const orderData = {
      AccountID: accountId,
      OriginalTotalPrice: originalTotalPrice,
      DiscountAmount: orderDiscountAmount,
      FinalAmount: finalAmount,
      CurrencyID: currency, // <<< LƯU TIỀN TỆ CỦA ĐƠN HÀNG
      PromotionID: promotionId,
      OrderStatus:
        finalAmount > 0 ? OrderStatus.PENDING_PAYMENT : OrderStatus.COMPLETED, // <<< TỰ ĐỘNG COMPLETE NẾU LÀ ĐƠN 0 ĐỒNG
    };
    const newOrder = await orderRepository.createOrder(orderData, transaction);
    const orderId = newOrder.OrderID;

    // 7. Tạo OrderItems
    const orderItemsData = cartDetails.items.map((item) => {
      // Giá tại lúc đặt hàng là giá đã được chiết khấu (nếu có) của khóa học,
      // theo đúng loại tiền tệ của đơn hàng.
      const priceAtOrder =
        item.pricing.display.discountedPrice ??
        item.pricing.display.originalPrice;

      return {
        CourseID: item.courseId,
        PriceAtOrder: priceAtOrder, // Lấy giá từ cấu trúc pricing.display
      };
    });
    await orderRepository.createOrderItems(
      orderId,
      orderItemsData,
      transaction
    );

    // 8. *** TĂNG USAGE COUNT (NẾU CÓ PROMOTION) ***
    if (promotionId) {
      await promotionService.incrementUsageCount(promotionId, transaction);
    }

    // 9. Xóa giỏ hàng
    await cartRepository.clearCart(cartDetails.cartId, transaction);
    if (finalAmount <= 0) {
      logger.info(`Processing free order ${newOrder.OrderID} immediately.`);
      // Không có paymentId vì không có thanh toán
      await processSuccessfulOrder(newOrder.OrderID, null, transaction);
    }
    // 10. Commit
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
    // Ném lại lỗi để controller xử lý (bao gồm lỗi từ incrementUsageCount)
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
  // Hàm findOrderByIdWithDetails đã được cập nhật ở repository để lấy thông tin cần thiết
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

  // Chuyển đổi các item trong đơn hàng sang định dạng đầy đủ với cấu trúc pricing
  const itemsWithPricing = await Promise.all(
    order.items.map(async (item) => {
      // Vì giá trị trong OrderItems đã được lưu theo đúng tiền tệ của đơn hàng (order.CurrencyID),
      // chúng ta sẽ coi đó là giá "base" cho ngữ cảnh của đơn hàng này.
      // FE chỉ cần hiển thị giá này mà không cần quan tâm đến việc quy đổi nữa.
      const pricing = {
        // base và display là như nhau trong ngữ cảnh xem lại chi tiết đơn hàng.
        // Giá đã được "chốt" tại thời điểm đặt hàng.
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
        // --- Thêm đầy đủ các trường mà FE cần ---
        orderItemId: item.OrderItemID,
        courseId: item.CourseID,
        courseName: item.CourseName,
        slug: item.Slug, // Thêm slug để FE có thể tạo link
        thumbnailUrl: item.ThumbnailUrl, // Thêm ảnh thumbnail
        instructorName: item.InstructorName, // Thêm tên giảng viên
        enrollmentId: item.EnrollmentID, // Trả về ID ghi danh nếu có
        pricing, // Cấu trúc giá đã chốt tại thời điểm mua
      };
    })
  );

  order.items = itemsWithPricing;

  // Trả về toàn bộ object order đã được làm giàu thông tin và chuyển đổi sang camelCase
  return toCamelCaseObject(order);
};

module.exports = {
  createOrderFromCart,
  processSuccessfulOrder,
  getMyOrders,
  getMyOrderDetails,
};
