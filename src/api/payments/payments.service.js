const httpStatus = require('http-status').status;
const Decimal = require('decimal.js');
const moment = require('moment-timezone');
const paymentRepository = require('./payments.repository');
const orderRepository = require('../orders/orders.repository'); // Cần order repo
const orderService = require('../orders/orders.service'); // Cần order service
const vnpayUtil = require('../../utils/vnpay.util');
const ApiError = require('../../core/errors/ApiError');
const OrderStatus = require('../../core/enums/OrderStatus');
const PaymentStatus = require('../../core/enums/PaymentStatus');
const PaymentMethod = require('../../core/enums/PaymentMethod'); // Sẽ tạo enum này
const Currency = require('../../core/enums/Currency'); // Sẽ tạo enum này
const logger = require('../../utils/logger');

const { getConnection, sql } = require('../../database/connection');
const notificationService = require('../notifications/notifications.service');

/**
 * Tạo URL thanh toán VNPay cho một đơn hàng.
 * @param {number} orderId
 * @param {string} ipAddr - IP của khách hàng.
 * @param {string} [bankCode=''] - Mã ngân hàng (nếu chọn thanh toán qua thẻ/tk cụ thể).
 * @param {string} [locale='vn'] - Ngôn ngữ giao diện VNPay.
 * @returns {Promise<string>} - URL thanh toán.
 */
const createVnpayUrl = async (
  orderId,
  ipAddr,
  bankCode = '',
  locale = 'vn'
) => {
  // 1. Lấy thông tin đơn hàng
  const order = await orderRepository.findOrderByIdWithDetails(orderId); // Lấy chi tiết để có FinalAmount
  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy đơn hàng.');
  }
  if (order.OrderStatus !== OrderStatus.PENDING_PAYMENT) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Đơn hàng này không ở trạng thái chờ thanh toán.'
    );
  }

  // 2. Tạo URL
  const amount = order.FinalAmount;
  const orderInfo = `Thanh toan don hang ${orderId}`;
  const txnRef = orderId.toString(); // VNPay yêu cầu string? Kiểm tra lại docs.

  const paymentUrl = vnpayUtil.createPaymentUrl(
    ipAddr,
    amount,
    orderInfo,
    txnRef,
    'other',
    locale,
    bankCode
  );

  return paymentUrl;
};

/**
 * Xử lý dữ liệu trả về từ VNPay (Return URL).
 * CHỈ xác thực chữ ký và trả về trạng thái cơ bản cho client. KHÔNG cập nhật DB.
 * @param {object} vnpParams - Query params từ URL trả về.
 * @returns {Promise<{isValid: boolean, message: string, orderId: string, code: string}>}
 */
const processVnpayReturn = async (vnpParams) => {
  const secureHash = vnpParams.vnp_SecureHash;
  if (!secureHash) {
    return {
      isValid: false,
      message: 'Thiếu chữ ký bảo mật.',
      code: '97',
      orderId: vnpParams.vnp_TxnRef,
    };
  }

  const isValid = vnpayUtil.verifySignature({ ...vnpParams }, secureHash); // Truyền bản copy

  if (!isValid) {
    return {
      isValid: false,
      message: 'Chữ ký không hợp lệ.',
      code: '97',
      orderId: vnpParams.vnp_TxnRef,
    };
  }

  const responseCode = vnpParams.vnp_ResponseCode;
  const orderId = vnpParams.vnp_TxnRef;
  let message = 'Giao dịch đang được xử lý.'; // Mặc định

  // Dựa vào mã lỗi VNPay để trả message thân thiện hơn
  if (responseCode === '00') {
    message = 'Giao dịch thành công! Đang chờ hệ thống xác nhận...';
  } else if (responseCode === '24') {
    message = 'Giao dịch không thành công do bạn đã hủy giao dịch.';
  } else {
    message =
      'Giao dịch không thành công. Vui lòng thử lại hoặc liên hệ hỗ trợ.';
    logger.warn(
      `VNPay Return Failed: OrderID=${orderId}, ResponseCode=${responseCode}`
    );
  }

  return { isValid: true, message, orderId, code: responseCode };
};

/**
 * Xử lý dữ liệu từ VNPay IPN (Instant Payment Notification - GET Request).
 * Xác thực, kiểm tra, cập nhật DB, tạo enrollment, tạo payment split.
 * @param {object} vnpParams - Query params từ IPN request.
 * @returns {Promise<{RspCode: string, Message: string}>} - Response trả về cho VNPay server.
 */
const processVnpayIpn = async (vnpParams) => {
  const secureHashReceived = vnpParams.vnp_SecureHash;
  // Sao chép params để không thay đổi object gốc khi verify signature
  const paramsToVerify = { ...vnpParams };

  if (!secureHashReceived) {
    logger.error('VNPay IPN Error: Missing Secure Hash. Params:', vnpParams);
    return { RspCode: '97', Message: 'Invalid Checksum' }; // Mã lỗi theo VNPay
  }

  // 1. Xác thực chữ ký
  const isValidSignature = vnpayUtil.verifySignature(
    paramsToVerify,
    secureHashReceived
  );
  if (!isValidSignature) {
    logger.error('VNPay IPN Error: Invalid Signature. Params:', vnpParams);
    return { RspCode: '97', Message: 'Invalid Checksum' };
  }

  // Lấy các tham số quan trọng từ VNPay
  const orderIdStr = vnpParams.vnp_TxnRef; // Mã đơn hàng của bạn
  const responseCode = vnpParams.vnp_ResponseCode; // '00' là thành công
  const transactionStatus = vnpParams.vnp_TransactionStatus; // '00' là thành công (có thể dùng thay hoặc cùng responseCode)
  const vnpTransactionNo = vnpParams.vnp_TransactionNo; // Mã giao dịch của VNPay
  const vnpBankCode = vnpParams.vnp_BankCode;
  const vnpCardType = vnpParams.vnp_CardType;
  const vnpOrderInfo = vnpParams.vnp_OrderInfo;
  const vnpPayDateStr = vnpParams.vnp_PayDate; // Định dạng YYYYMMDDHHmmss

  const orderId = parseInt(orderIdStr, 10);
  if (Number.isNaN(orderId)) {
    logger.error(
      `VNPay IPN Error: Invalid Order ID format from vnp_TxnRef: ${orderIdStr}`
    );
    return { RspCode: '01', Message: 'Order not found' };
  }

  logger.info(
    `Processing VNPay IPN for OrderID: ${orderId}, ResponseCode: ${responseCode}, TransactionStatus: ${transactionStatus}`
  );
  const vnpAmountRaw = vnpParams.vnp_Amount;
  if (vnpAmountRaw === undefined || vnpAmountRaw === null) {
    logger.error(
      `VNPay IPN Error: vnp_Amount is missing or null. OrderID: ${orderIdStr}`
    );
    return { RspCode: '04', Message: 'Invalid Amount (Missing from VNPay)' };
  }

  let vnpAmountDecimal;
  try {
    // Chuyển vnp_Amount (đã x100) thành Decimal rồi chia cho 100
    vnpAmountDecimal = new Decimal(vnpAmountRaw).dividedBy(100);
  } catch (e) {
    logger.error(
      `VNPay IPN Error: Invalid vnp_Amount format: ${vnpAmountRaw}. OrderID: ${orderIdStr}`
    );
    return { RspCode: '04', Message: 'Invalid Amount (Format Error)' };
  }

  // 2. Tìm đơn hàng trong DB
  const order = await orderRepository.findOrderByIdWithDetails(orderId); // Lấy chi tiết để có FinalAmount
  if (!order) {
    logger.error(`VNPay IPN Error: Order ${orderId} not found in DB.`);
    return { RspCode: '01', Message: 'Order not found' }; // Mã đơn hàng không tồn tại
  }

  // 3. Kiểm tra trạng thái đơn hàng (tránh xử lý lại nếu đã COMPLETED hoặc FAILED từ IPN trước)
  // Nếu đã COMPLETED và VNPay báo thành công (00) -> OK, trả về 00 để VNPay không gửi lại.
  if (
    order.OrderStatus === OrderStatus.COMPLETED &&
    responseCode === '00' &&
    transactionStatus === '00'
  ) {
    logger.warn(
      `VNPay IPN Info: Order ${orderId} already confirmed as COMPLETED. ExternalTxnNo: ${vnpTransactionNo}`
    );
    // Kiểm tra xem payment record có khớp không, nếu cần
    const existingPayment =
      await paymentRepository.findPaymentByOrderId(orderId);
    if (
      existingPayment &&
      existingPayment.ExternalTransactionID === vnpTransactionNo &&
      existingPayment.PaymentStatusID === PaymentStatus.SUCCESS
    ) {
      return { RspCode: '00', Message: 'Confirm Success' };
    }

    // Có thể là IPN cho một lần thanh toán khác của cùng đơn hàng (hiếm) hoặc lỗi
    logger.error(
      `VNPay IPN Warning: Order ${orderId} is COMPLETED but IPN details might differ or payment record missing/mismatched. VNPayTxnNo: ${vnpTransactionNo}`
    );
    // Trả về lỗi để VNPay có thể retry nếu đây là giao dịch mới thực sự
    return {
      RspCode: '02',
      Message:
        'Order already confirmed (but IPN data mismatch or payment record issue)',
    };
  }
  // Nếu đã FAILED và VNPay báo không thành công (khác 00) -> OK
  if (
    order.OrderStatus === OrderStatus.FAILED &&
    (responseCode !== '00' || transactionStatus !== '00')
  ) {
    logger.warn(
      `VNPay IPN Info: Order ${orderId} already marked as FAILED. ExternalTxnNo: ${vnpTransactionNo}`
    );
    return { RspCode: '00', Message: 'Confirm Success' }; // Báo đã xử lý (dù giao dịch gốc fail)
  }
  // Nếu trạng thái không phải PENDING_PAYMENT (và không phải các trường hợp trên) -> Bất thường
  if (order.OrderStatus !== OrderStatus.PENDING_PAYMENT) {
    logger.error(
      `VNPay IPN Error: Order ${orderId} status is not PENDING_PAYMENT. Current status: ${order.OrderStatus}. VNPayTxnNo: ${vnpTransactionNo}`
    );
    return {
      RspCode: '02',
      Message: 'Order already confirmed or in invalid state',
    };
  }

  // 4. Kiểm tra số tiền
  let orderFinalAmountDecimal;
  try {
    orderFinalAmountDecimal = new Decimal(order.FinalAmount.toString()); // Chuyển giá trị từ DB sang Decimal
  } catch (e) {
    logger.error(
      `VNPay IPN Error: Could not parse order.FinalAmount to Decimal for Order ${orderId}. Value: ${order.FinalAmount}`
    );
    return { RspCode: '99', Message: 'Internal Error (Order Amount Parse)' };
  }

  // So sánh bằng phương thức của Decimal.js để đảm bảo chính xác
  if (!orderFinalAmountDecimal.equals(vnpAmountDecimal)) {
    logger.error(
      `VNPay IPN Error: Invalid Amount for Order ${orderId}. DB: ${orderFinalAmountDecimal.toString()}, VNPay: ${vnpAmountDecimal.toString()}. VNPayTxnNo: ${vnpTransactionNo}`
    );
    return { RspCode: '04', Message: 'Invalid Amount' };
  }

  // 5. Xử lý dựa trên kết quả giao dịch từ VNPay
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool); // DB Transaction
  try {
    await transaction.begin();

    let paymentStatusId;
    let paymentCompletedAt = null;
    let newOrderStatus;

    if (responseCode === '00' && transactionStatus === '00') {
      // Giao dịch thành công
      paymentStatusId = PaymentStatus.SUCCESS;
      newOrderStatus = OrderStatus.COMPLETED;
      paymentCompletedAt = moment
        .tz(vnpPayDateStr, 'YYYYMMDDHHmmss', 'Asia/Ho_Chi_Minh')
        .toDate();
    } else {
      // Giao dịch thất bại hoặc bị hủy
      paymentStatusId = PaymentStatus.FAILED;
      newOrderStatus = OrderStatus.FAILED;
      // TransactionCompletedAt có thể là null hoặc thời gian VNPay ghi nhận lỗi
      // paymentCompletedAt = moment.tz(vnpPayDateStr, 'YYYYMMDDHHmmss', 'Asia/Ho_Chi_Minh').toDate(); // Hoặc null
      logger.warn(
        `VNPay IPN: Transaction failed/cancelled for Order ${orderId}. ResponseCode: ${responseCode}, TxnStatus: ${transactionStatus}`
      );
    }

    // 6. Tạo hoặc cập nhật bản ghi CoursePayments
    // Kiểm tra xem đã có payment record cho order này với ExternalTransactionID này chưa
    // (Để tránh tạo nhiều payment record nếu IPN bị gọi lại với cùng TransactionNo)
    let payment = await transaction
      .request()
      .input('ExternalTransactionID', sql.VarChar, vnpTransactionNo)
      .input('PaymentMethodID', sql.VarChar, PaymentMethod.VNPAY)
      .query(
        `SELECT * FROM CoursePayments WHERE ExternalTransactionID = @ExternalTransactionID AND PaymentMethodID = @PaymentMethodID;`
      )
      .then((r) => r.recordset[0]);

    console.log('payment', payment);

    if (payment && payment.PaymentStatusID === PaymentStatus.SUCCESS) {
      logger.warn(
        `VNPay IPN Info: Payment for Order ${orderId} with VNPayTxnNo ${vnpTransactionNo} already processed as SUCCESS.`
      );
      await transaction.rollback(); // Không làm gì thêm nếu payment đã SUCCESS
      return { RspCode: '00', Message: 'Confirm Success' }; // Đã xử lý
    }

    if (!payment) {
      // Nếu chưa có payment với ExternalTransactionID này, tạo mới
      const paymentData = {
        OrderID: orderId,
        FinalAmount: orderFinalAmountDecimal.toString(), // Số tiền thực tế user phải trả cho đơn hàng
        PaymentMethodID: PaymentMethod.VNPAY,
        OriginalCurrencyID: Currency.VND, // VNPay thường là VND
        OriginalAmount: vnpAmountDecimal.toString(), // Số tiền VNPay xử lý
        ExternalTransactionID: vnpTransactionNo,
        ConvertedCurrencyID: Currency.VND,
        ConvertedTotalAmount: orderFinalAmountDecimal.toString(), // Giả sử không có chuyển đổi tiền tệ phức tạp
        ConversionRate: 1,
        TransactionFee: 0, // Cần lấy từ VNPay nếu có, hoặc tự tính
        PaymentStatusID: paymentStatusId,
        TransactionCompletedAt: paymentCompletedAt,
        AdditionalInfo: JSON.stringify({
          bankCode: vnpBankCode,
          cardType: vnpCardType,
          orderInfo: vnpOrderInfo,
          payDate: vnpPayDateStr,
          vnpParams, // Lưu lại toàn bộ params nếu cần debug
        }),
      };
      payment = await paymentRepository.createCoursePayment(
        paymentData,
        transaction
      );
      logger.info(
        `Created new CoursePayment record ${payment.PaymentID} for Order ${orderId}, VNPayTxnNo ${vnpTransactionNo}`
      );
    } else {
      // Nếu đã có payment record (ví dụ từ lần retry IPN trước bị lỗi giữa chừng), cập nhật status
      payment = await paymentRepository.updatePaymentStatus(
        payment.PaymentID,
        paymentStatusId,
        paymentCompletedAt,
        vnpTransactionNo, // Đảm bảo ExternalTransactionID đúng
        transaction
      );
      logger.info(
        `Updated existing CoursePayment record ${payment.PaymentID} for Order ${orderId} to status ${paymentStatusId}.`
      );
    }

    // 7. Xử lý đơn hàng nếu thanh toán thành công
    if (paymentStatusId === PaymentStatus.SUCCESS) {
      await orderService.processSuccessfulOrder(
        orderId,
        payment.PaymentID,
        transaction
      );
      // Xử lý xong SUCCESS rồi thì không làm gì nữa
      try {
        const message = `Chúc mừng! Thanh toán cho đơn hàng #${orderId} của bạn đã thành công. Đơn hàng đang được xử lý.`;
        await notificationService.createNotification(
          order.AccountID, // Lấy AccountID từ order đã tìm trước đó
          'ORDER_SUCCESS', // Loại thông báo
          message,
          { type: 'Order', id: orderId.toString() } // Thông báo liên kết với đơn hàng
        );
      } catch (notifyError) {
        logger.error(
          `Failed to send order success notification for order ${orderId}:`,
          notifyError
        );
      }
    } else {
      // Chỉ xử lý update nếu KHÔNG phải thanh toán thành công
      console.log('orderId', orderId);
      console.log('OrderStatus', newOrderStatus);
      await orderRepository.updateOrderStatusAndPayment(
        orderId,
        {
          OrderStatus: newOrderStatus,
          PaymentID: payment?.PaymentID || null,
        },
        transaction
      );
      try {
        const message = `Rất tiếc, thanh toán cho đơn hàng #${orderId} của bạn đã ${
          newOrderStatus === OrderStatus.FAILED ? 'thất bại' : 'bị hủy'
        }. Vui lòng thử lại hoặc liên hệ hỗ trợ.`;
        await notificationService.createNotification(
          order.AccountID, // Lấy AccountID từ order đã tìm trước đó
          'ORDER_FAILED', // Loại mới
          message,
          { type: 'Order', id: orderId.toString() } // Thông báo liên kết với đơn hàng
        );
      } catch (notifyError) {
        logger.error(
          `Failed to send order failed notification for order ${orderId}:`,
          notifyError
        );
      }
    }

    logger.info(
      `VNPay IPN processed for Order ${orderId}. Final OrderStatus: ${newOrderStatus}, PaymentStatus: ${paymentStatusId}.`
    );
    await transaction.commit();

    // Trả về lỗi cho VNPay? Họ thường mong 00 nếu xử lý xong (ngay cả khi GD thất bại)
    // Kiểm tra lại docs VNPay cho trường hợp GD không thành công
    // Thường vẫn trả về 00 để báo là đã nhận và xử lý IPN
    return { RspCode: '00', Message: 'Confirm Success' }; // Báo đã xử lý IPN (dù GD gốc fail)
  } catch (error) {
    logger.error(
      `VNPay IPN Critical Error processing Order ${orderId}:`,
      error
    );
    await transaction.rollback();
    // KHÔNG trả lỗi 00 cho VNPay trong trường hợp lỗi hệ thống nghiêm trọng
    // Họ sẽ thử gửi lại IPN sau
    return { RspCode: '99', Message: 'Unknown error' }; // Hoặc mã lỗi khác phù hợp
  }
};

module.exports = {
  createVnpayUrl,
  processVnpayReturn,
  processVnpayIpn,
};
