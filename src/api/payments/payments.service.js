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
const stripe = require('../../config/stripe');
const config = require('../../config');
const { getConnection, sql } = require('../../database/connection');
const notificationService = require('../notifications/notifications.service');
const { getLatestRate } = require('../exchangeRates/exchange-rates.service');
const userRepository = require('../users/users.repository');
const nowPaymentsUtil = require('../../utils/nowpayments.util');

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
  const order = await orderRepository.findOrderByIdWithDetails(orderId);
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
  const txnRef = orderId.toString();

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

  const isValid = vnpayUtil.verifySignature({ ...vnpParams }, secureHash);

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
  let message = 'Giao dịch đang được xử lý.';

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
  const paramsToVerify = { ...vnpParams };

  if (!secureHashReceived) {
    logger.error('VNPay IPN Error: Missing Secure Hash. Params:', vnpParams);
    return { RspCode: '97', Message: 'Invalid Checksum' };
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

  const orderIdStr = vnpParams.vnp_TxnRef;
  const responseCode = vnpParams.vnp_ResponseCode;
  const transactionStatus = vnpParams.vnp_TransactionStatus;
  const vnpTransactionNo = vnpParams.vnp_TransactionNo;
  const vnpBankCode = vnpParams.vnp_BankCode;
  const vnpCardType = vnpParams.vnp_CardType;
  const vnpOrderInfo = vnpParams.vnp_OrderInfo;
  const vnpPayDateStr = vnpParams.vnp_PayDate;

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
    vnpAmountDecimal = new Decimal(vnpAmountRaw).dividedBy(100);
  } catch (e) {
    logger.error(
      `VNPay IPN Error: Invalid vnp_Amount format: ${vnpAmountRaw}. OrderID: ${orderIdStr}`
    );
    return { RspCode: '04', Message: 'Invalid Amount (Format Error)' };
  }

  // 2. Tìm đơn hàng trong DB
  const order = await orderRepository.findOrderByIdWithDetails(orderId);
  if (!order) {
    logger.error(`VNPay IPN Error: Order ${orderId} not found in DB.`);
    return { RspCode: '01', Message: 'Order not found' };
  }

  // 3. Kiểm tra trạng thái đơn hàng (tránh xử lý lại nếu đã COMPLETED hoặc FAILED từ IPN trước)
  if (
    order.OrderStatus === OrderStatus.COMPLETED &&
    responseCode === '00' &&
    transactionStatus === '00'
  ) {
    logger.warn(
      `VNPay IPN Info: Order ${orderId} already confirmed as COMPLETED. ExternalTxnNo: ${vnpTransactionNo}`
    );
    const existingPayment =
      await paymentRepository.findPaymentByOrderId(orderId);
    if (
      existingPayment &&
      existingPayment.ExternalTransactionID === vnpTransactionNo &&
      existingPayment.PaymentStatusID === PaymentStatus.SUCCESS
    ) {
      return { RspCode: '00', Message: 'Confirm Success' };
    }

    logger.error(
      `VNPay IPN Warning: Order ${orderId} is COMPLETED but IPN details might differ or payment record missing/mismatched. VNPayTxnNo: ${vnpTransactionNo}`
    );

    return {
      RspCode: '02',
      Message:
        'Order already confirmed (but IPN data mismatch or payment record issue)',
    };
  }
  if (
    order.OrderStatus === OrderStatus.FAILED &&
    (responseCode !== '00' || transactionStatus !== '00')
  ) {
    logger.warn(
      `VNPay IPN Info: Order ${orderId} already marked as FAILED. ExternalTxnNo: ${vnpTransactionNo}`
    );
    return { RspCode: '00', Message: 'Confirm Success' };
  }

  if (order.OrderStatus !== OrderStatus.PENDING_PAYMENT) {
    logger.error(
      `VNPay IPN Error: Order ${orderId} status is not PENDING_PAYMENT. Current status: ${order.OrderStatus}. VNPayTxnNo: ${vnpTransactionNo}`
    );
    return {
      RspCode: '02',
      Message: 'Order already confirmed or in invalid state',
    };
  }

  let orderFinalAmountDecimal;
  try {
    orderFinalAmountDecimal = new Decimal(order.FinalAmount.toString());
  } catch (e) {
    logger.error(
      `VNPay IPN Error: Could not parse order.FinalAmount to Decimal for Order ${orderId}. Value: ${order.FinalAmount}`
    );
    return { RspCode: '99', Message: 'Internal Error (Order Amount Parse)' };
  }
  if (!orderFinalAmountDecimal.equals(vnpAmountDecimal)) {
    logger.error(
      `VNPay IPN Error: Invalid Amount for Order ${orderId}. DB: ${orderFinalAmountDecimal.toString()}, VNPay: ${vnpAmountDecimal.toString()}. VNPayTxnNo: ${vnpTransactionNo}`
    );
    return { RspCode: '04', Message: 'Invalid Amount' };
  }

  // 5. Xử lý dựa trên kết quả giao dịch từ VNPay
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    let paymentStatusId;
    let paymentCompletedAt = null;
    let newOrderStatus;

    if (responseCode === '00' && transactionStatus === '00') {
      paymentStatusId = PaymentStatus.SUCCESS;
      newOrderStatus = OrderStatus.COMPLETED;
      paymentCompletedAt = moment
        .tz(vnpPayDateStr, 'YYYYMMDDHHmmss', 'Asia/Ho_Chi_Minh')
        .toDate();
    } else {
      paymentStatusId = PaymentStatus.FAILED;
      newOrderStatus = OrderStatus.FAILED;

      logger.warn(
        `VNPay IPN: Transaction failed/cancelled for Order ${orderId}. ResponseCode: ${responseCode}, TxnStatus: ${transactionStatus}`
      );
    }

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
      await transaction.rollback();
      return { RspCode: '00', Message: 'Confirm Success' };
    }

    if (!payment) {
      const paymentData = {
        OrderID: orderId,
        FinalAmount: orderFinalAmountDecimal.toString(),
        PaymentMethodID: PaymentMethod.VNPAY,
        OriginalCurrencyID: Currency.VND,
        OriginalAmount: vnpAmountDecimal.toString(),
        ExternalTransactionID: vnpTransactionNo,
        ConvertedCurrencyID: Currency.VND,
        ConvertedTotalAmount: orderFinalAmountDecimal.toString(),
        ConversionRate: 1,
        TransactionFee: 0,
        PaymentStatusID: paymentStatusId,
        TransactionCompletedAt: paymentCompletedAt,
        AdditionalInfo: JSON.stringify({
          bankCode: vnpBankCode,
          cardType: vnpCardType,
          orderInfo: vnpOrderInfo,
          payDate: vnpPayDateStr,
          vnpParams,
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
      payment = await paymentRepository.updatePaymentStatus(
        payment.PaymentID,
        paymentStatusId,
        paymentCompletedAt,
        vnpTransactionNo,
        transaction
      );
      logger.info(
        `Updated existing CoursePayment record ${payment.PaymentID} for Order ${orderId} to status ${paymentStatusId}.`
      );
    }

    if (paymentStatusId === PaymentStatus.SUCCESS) {
      await orderService.processSuccessfulOrder(
        orderId,
        payment.PaymentID,
        transaction
      );

      try {
        const message = `Chúc mừng! Thanh toán cho đơn hàng #${orderId} của bạn đã thành công. Đơn hàng đang được xử lý.`;
        await notificationService.createNotification(
          order.AccountID,
          'ORDER_SUCCESS',
          message,
          { type: 'Order', id: orderId.toString() }
        );
      } catch (notifyError) {
        logger.error(
          `Failed to send order success notification for order ${orderId}:`,
          notifyError
        );
      }
    } else {
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
          order.AccountID,
          'ORDER_FAILED',
          message,
          { type: 'Order', id: orderId.toString() }
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

    return { RspCode: '00', Message: 'Confirm Success' };
  } catch (error) {
    logger.error(
      `VNPay IPN Critical Error processing Order ${orderId}:`,
      error
    );
    await transaction.rollback();

    return { RspCode: '99', Message: 'Unknown error' };
  }
};

/**
 * Tạo phiên thanh toán Stripe Checkout cho một đơn hàng.
 * @param {number} orderId
 * @param {number} accountId
 * @returns {Promise<{sessionId: string, paymentUrl: string}>}
 */
const createStripeCheckoutSession = async (orderId, accountId) => {
  if (!stripe) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Chức năng thanh toán Stripe chưa được cấu hình.'
    );
  }

  const order = await orderRepository.findOrderByIdWithDetails(orderId);
  if (!order || order.AccountID !== accountId) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Đơn hàng không hợp lệ.');
  }
  if (order.OrderStatus !== OrderStatus.PENDING_PAYMENT) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Đơn hàng không ở trạng thái chờ thanh toán.'
    );
  }
  if (order.CurrencyID !== 'USD') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Stripe chỉ hỗ trợ thanh toán cho đơn hàng USD.'
    );
  }

  const lineItems = order.items.map((item) => ({
    price_data: {
      currency: 'usd',
      product_data: {
        name: item.CourseName,
        description: `Bởi ${item.InstructorName}`,
        // images: [item.ThumbnailUrl] // Có thể thêm ảnh
      },
      unit_amount: Math.round(item.PriceAtOrder * 100), // Stripe yêu cầu giá bằng cent
    },
    quantity: 1,
  }));

  // Xử lý giảm giá (nếu có)
  if (order.DiscountAmount > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Giảm giá',
        },
        unit_amount: -Math.round(order.DiscountAmount * 100),
      },
      quantity: 1,
    });
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: lineItems,
    mode: 'payment',
    success_url: `${config.frontendUrl}/payment/result?status=success&orderId=${orderId}`,
    cancel_url: `${config.frontendUrl}/payment/result?status=cancel&orderId=${orderId}`,
    metadata: {
      orderId: order.OrderID,
      accountId: order.AccountID,
    },
    customer_email: (await userRepository.findUserProfileById(accountId)).Email, // Tự điền email
  });

  // (Optional) Tạo một bản ghi PENDING trong CoursePayments ở đây
  // để theo dõi các phiên Stripe đã được tạo.

  return {
    sessionId: session.id,
    paymentUrl: session.url,
  };
};

/**
 * Xử lý webhook từ Stripe.
 * @param {object} event - Sự kiện từ Stripe.
 * @returns {Promise<void>}
 */
const processStripeWebhook = async (event) => {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { orderId, accountId } = session.metadata;

    logger.info(
      `Received Stripe checkout.session.completed for OrderID: ${orderId}`
    );

    const order = await orderRepository.findOrderByIdWithDetails(orderId);
    if (!order || order.OrderStatus === OrderStatus.COMPLETED) {
      logger.warn(
        `Order ${orderId} not found or already completed. Ignoring Stripe webhook.`
      );
      return;
    }

    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    try {
      await transaction.begin();

      const paymentData = {
        OrderID: orderId,
        FinalAmount: new Decimal(session.amount_total)
          .dividedBy(100)
          .toString(),
        PaymentMethodID: PaymentMethod.STRIPE,
        OriginalCurrencyID: 'USD',
        OriginalAmount: new Decimal(session.amount_total)
          .dividedBy(100)
          .toString(),
        ExternalTransactionID: session.payment_intent,
        ConvertedCurrencyID: config.settings.baseCurrency,
        ConvertedTotalAmount: 0,
        ConversionRate: 0,
        PaymentStatusID: PaymentStatus.SUCCESS,
        TransactionCompletedAt: new Date(session.created * 1000),
        AdditionalInfo: JSON.stringify(session),
      };

      // Quy đổi về VND để tính doanh thu
      const rate = await getLatestRate('USD', 'VND');
      paymentData.ConversionRate = rate.toNumber();
      paymentData.ConvertedTotalAmount = new Decimal(paymentData.OriginalAmount)
        .times(rate)
        .toDP(4)
        .toString();

      const payment = await paymentRepository.createCoursePayment(
        paymentData,
        transaction
      );

      await orderService.processSuccessfulOrder(
        orderId,
        payment.PaymentID,
        transaction
      );

      await transaction.commit();
      logger.info(
        `Successfully processed Stripe webhook for OrderID: ${orderId}`
      );
    } catch (error) {
      logger.error(
        `Error processing Stripe webhook for OrderID ${orderId}:`,
        error
      );
      await transaction.rollback();

      throw error;
    }
  }
};

/**
 * Tạo hóa đơn thanh toán Crypto qua NOWPayments.
 * @param {number} orderId
 * @param {string} cryptoCurrency - Loại coin người dùng chọn, vd: 'USDTTRC20'.
 * @param {number} accountId - ID người dùng để kiểm tra quyền.
 * @returns {Promise<object>} - Dữ liệu cần thiết để FE hiển thị.
 */
const createCryptoInvoice = async (orderId, cryptoCurrency, accountId) => {
  // 1. Lấy thông tin đơn hàng và kiểm tra quyền
  const order = await orderRepository.findOrderByIdWithDetails(orderId);
  if (!order || order.AccountID !== accountId) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Đơn hàng không hợp lệ.');
  }
  if (order.OrderStatus !== OrderStatus.PENDING_PAYMENT) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Đơn hàng không ở trạng thái chờ thanh toán.'
    );
  }

  // 2. Chuẩn bị dữ liệu để gọi NOWPayments
  const invoiceData = {
    price_amount: order.FinalAmount,
    price_currency: order.CurrencyID.toLowerCase(),
    pay_currency: cryptoCurrency,
    order_id: order.OrderID.toString(),
    order_description: `Payment for order #${order.OrderID}`,
    ipn_callback_url: `${config.serverUrl}/webhooks/crypto`,
  };

  // 3. Gọi NOWPayments API
  const nowPaymentsResponse =
    await nowPaymentsUtil.createPaymentInvoice(invoiceData);

  // 4. Lưu thông tin giao dịch vào CSDL
  const paymentData = {
    OrderID: orderId,
    FinalAmount: order.FinalAmount,
    PaymentMethodID: PaymentMethod.CRYPTO,
    OriginalCurrencyID: order.CurrencyID,
    OriginalAmount: nowPaymentsResponse.price_amount,
    ExternalTransactionID: nowPaymentsResponse.payment_id,
    ConvertedCurrencyID: config.settings.baseCurrency,
    ConvertedTotalAmount: 0,
    ConversionRate: 0,
    PaymentStatusID: PaymentStatus.PENDING,
    AdditionalInfo: JSON.stringify({
      payAddress: nowPaymentsResponse.pay_address,
      payAmount: nowPaymentsResponse.pay_amount,
      cryptoCurrency: nowPaymentsResponse.pay_currency,
      network: nowPaymentsResponse.network,
      paymentId: nowPaymentsResponse.payment_id,
    }),
  };

  await paymentRepository.createCoursePayment(paymentData);

  // 5. Trả về thông tin cho Frontend
  return {
    paymentId: nowPaymentsResponse.payment_id,
    payAddress: nowPaymentsResponse.pay_address,
    payAmount: nowPaymentsResponse.pay_amount,
    cryptoCurrency: nowPaymentsResponse.pay_currency,
    network: nowPaymentsResponse.network,
    originalAmount: nowPaymentsResponse.price_amount,
    originalCurrency: nowPaymentsResponse.price_currency,
    expiresAt: nowPaymentsResponse.valid_until,
  };
};

/**
 * Xử lý webhook từ NOWPayments.
 * @param {string} signature - Header x-nowpayments-sig.
 * @param {object} body - Body của webhook request.
 * @returns {Promise<void>}
 */
const processCryptoWebhook = async (signature, rawBody) => {
  // 1. Xác thực chữ ký
  if (!nowPaymentsUtil.verifyIpnSignature(signature, rawBody)) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid IPN signature.');
  }
  // 2. Parse rawBody thành object JSON để sử dụng
  let body;
  try {
    body = JSON.parse(rawBody.toString('utf-8'));
  } catch (e) {
    logger.error('Crypto Webhook Error: Failed to parse rawBody to JSON.', e);
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid webhook body format.');
  }

  const {
    payment_id: paymentId,
    payment_status: paymentStatus,
    order_id: orderIdStr,
    actually_paid: actuallyPaid,
    pay_currency: payCurrency,
  } = body;
  const orderId = parseInt(orderIdStr, 10);

  // 2. Tìm bản ghi thanh toán trong DB
  const payment = await paymentRepository.findPaymentByExternalId(
    paymentId,
    'CRYPTO'
  );
  if (!payment) {
    logger.error(
      `Crypto webhook: Payment with external ID ${paymentId} not found.`
    );
    // Vẫn trả về 200 để NOWPayments không gửi lại webhook không tồn tại
    return;
  }
  if (payment.PaymentStatusID === PaymentStatus.SUCCESS) {
    logger.warn(
      `Crypto webhook: Payment ${payment.PaymentID} already marked as SUCCESS. Ignoring.`
    );
    return;
  }

  // 3. Xử lý dựa trên trạng thái
  let newPaymentStatus;
  let newOrderStatus;

  if (paymentStatus === 'finished' || paymentStatus === 'confirmed') {
    newPaymentStatus = PaymentStatus.SUCCESS;
    newOrderStatus = OrderStatus.COMPLETED;
  } else if (['failed', 'expired', 'refunded'].includes(paymentStatus)) {
    newPaymentStatus = PaymentStatus.FAILED;
    newOrderStatus = OrderStatus.FAILED;
  } else {
    logger.info(
      `Crypto webhook: Received non-terminal status '${paymentStatus}' for payment ${paymentId}. Ignoring.`
    );
    return;
  }

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // Cập nhật bản ghi CoursePayments
    await paymentRepository.updatePaymentStatus(
      payment.PaymentID,
      newPaymentStatus,
      new Date(),
      transaction
    );

    // Nếu thành công, xử lý đơn hàng
    if (newPaymentStatus === PaymentStatus.SUCCESS) {
      await orderService.processSuccessfulOrder(
        orderId,
        payment.PaymentID,
        transaction
      );
    } else {
      // Nếu thất bại, chỉ cập nhật trạng thái đơn hàng
      await orderRepository.updateOrderStatusAndPayment(
        orderId,
        { OrderStatus: newOrderStatus },
        transaction
      );
    }

    await transaction.commit();
    logger.info(
      `Successfully processed Crypto webhook for OrderID ${orderId}, new status: ${newOrderStatus}`
    );
  } catch (error) {
    await transaction.rollback();
    logger.error(
      `Error processing Crypto webhook for OrderID ${orderId}:`,
      error
    );
    throw error;
  }
};

module.exports = {
  createVnpayUrl,
  processVnpayReturn,
  processVnpayIpn,
  createStripeCheckoutSession,
  processStripeWebhook,
  createCryptoInvoice,
  processCryptoWebhook,
};
