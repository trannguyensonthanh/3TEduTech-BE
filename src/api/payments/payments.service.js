const httpStatus = require('http-status').status;
const { v4: uuidv4 } = require('uuid');
const Decimal = require('decimal.js');
const moment = require('moment-timezone');
const paymentRepository = require('./payments.repository');
const orderRepository = require('../orders/orders.repository');
const orderService = require('../orders/orders.service');
const vnpayUtil = require('../../utils/vnpay.util');
const ApiError = require('../../core/errors/ApiError');
const OrderStatus = require('../../core/enums/OrderStatus');
const PaymentStatus = require('../../core/enums/PaymentStatus');
const PaymentMethod = require('../../core/enums/PaymentMethod');
const Currency = require('../../core/enums/Currency');
const logger = require('../../utils/logger');
const stripe = require('../../config/stripe');
const config = require('../../config');
const { getConnection, sql } = require('../../database/connection');
const notificationService = require('../notifications/notifications.service');
const { getLatestRate } = require('../exchangeRates/exchangeRates.service');
const userRepository = require('../users/users.repository');
const nowPaymentsUtil = require('../../utils/nowpayments.util');
const payPalUtil = require('../../utils/paypal.util');
const exchangeRateService = require('../exchangeRates/exchangeRates.service');
const momoUtil = require('../../utils/momo.util');
const settingsService = require('../settings/settings.service');

/**
 * Tạo URL thanh toán VNPay cho một đơn hàng.
 */
const createVnpayUrl = async (
  orderId,
  ipAddr,
  bankCode = '',
  locale = 'vn'
) => {
  const isEnabled = await settingsService.getSettingValue(
    'EnableVnPay',
    'true'
  );
  if (isEnabled !== 'true') {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Cổng thanh toán VNPay hiện không khả dụng.'
    );
  }
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
  const amount = order.FinalAmount;
  const orderInfo = `Thanh toan don hang ${orderId}`;
  const txnRef = orderId.toString();
  const options = {
    orderType: 'other',
    locale,
    bankCode,
    // Bạn cũng có thể override returnUrl ở đây nếu cần
    // returnUrl: 'https://mysite.com/another_return_path'
  };
  const clientIp = ipAddr.split(',')[0].trim();
  console.log('--- IP ĐƯỢC GỬI ĐẾN SERVICE ---', clientIp);
  const paymentUrl = vnpayUtil.createPaymentUrl(
    ipAddr,
    amount,
    orderInfo,
    txnRef,
    options
  );
  return paymentUrl;
};

/**
 * Xử lý dữ liệu trả về từ VNPay (Return URL).
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
 */
const processVnpayIpn = async (vnpParams) => {
  const secureHashReceived = vnpParams.vnp_SecureHash;
  const paramsToVerify = { ...vnpParams };
  if (!secureHashReceived) {
    logger.error('VNPay IPN Error: Missing Secure Hash. Params:', vnpParams);
    return { RspCode: '97', Message: 'Invalid Checksum' };
  }
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
  const order = await orderRepository.findOrderByIdWithDetails(orderId);
  if (!order) {
    logger.error(`VNPay IPN Error: Order ${orderId} not found in DB.`);
    return { RspCode: '01', Message: 'Order not found' };
  }
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
 */
const createStripeCheckoutSession = async (orderId, accountId) => {
  const isEnabled = await settingsService.getSettingValue(
    'EnableStripe',
    'true'
  );
  if (isEnabled !== 'true') {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Cổng thanh toán Stripe hiện không khả dụng.'
    );
  }
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
      },
      unit_amount: Math.round(item.PriceAtOrder * 100),
    },
    quantity: 1,
  }));
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
    success_url: `${config.frontendUrl}/payment/result?status=success&orderId=${orderId}`, // đường dẫn thành công
    cancel_url: `${config.frontendUrl}/payment/result?status=cancel&orderId=${orderId}`, // đường dẫn hủy
    metadata: {
      orderId: order.OrderID,
      accountId: order.AccountID,
    },
    customer_email: (await userRepository.findUserProfileById(accountId)).Email,
  });
  return {
    sessionId: session.id,
    paymentUrl: session.url,
  };
};

/**
 * Xử lý webhook từ Stripe.
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
 */
const createCryptoInvoice = async (orderId, cryptoCurrency, accountId) => {
  const isEnabled = await settingsService.getSettingValue(
    'EnableCrypto',
    'true'
  );
  if (isEnabled !== 'true') {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Cổng thanh toán Crypto hiện không khả dụng.'
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
  const invoiceData = {
    price_amount: order.FinalAmount,
    price_currency: order.CurrencyID.toLowerCase(),
    pay_currency: cryptoCurrency,
    order_id: order.OrderID.toString(),
    order_description: `Payment for order #${order.OrderID}`,
    ipn_callback_url: `${config.serverUrl}/webhooks/crypto`,
  };
  const nowPaymentsResponse =
    await nowPaymentsUtil.createPaymentInvoice(invoiceData);
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
 */
const processCryptoWebhook = async (signature, rawBody) => {
  // const isDevelopment = config.env === 'development';
  // const signatureVerified = nowPaymentsUtil.verifyIpnSignature(
  //   signature,
  //   rawBody
  // );

  // // ================================================================
  // // <<< ÁP DỤNG LOGIC "CỬA HẬU" TƯƠNG TỰ MOMO >>>
  // // ================================================================
  // if (!signatureVerified && !isDevelopment) {
  //   // Ở môi trường Production, nếu chữ ký sai, BẮT BUỘC phải dừng lại.
  //   throw new ApiError(
  //     httpStatus.UNAUTHORIZED,
  //     'Invalid NOWPayments IPN signature.'
  //   );
  // }

  // if (!signatureVerified && isDevelopment) {
  //   // Ở môi trường Development, nếu chữ ký sai, chỉ ghi log cảnh báo và tiếp tục chạy.
  //   logger.warn(
  //     '!!! [DEV MODE] Bypassing NOWPayments IPN signature check for demo purposes. DO NOT USE IN PRODUCTION! !!!'
  //   );
  // }

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
  } = body;
  const orderId = parseInt(orderIdStr, 10);

  const payment = await paymentRepository.findPaymentByExternalId(
    paymentId,
    'CRYPTO'
  );
  if (!payment) {
    logger.error(
      `Crypto webhook: Payment with external ID ${paymentId} not found.`
    );
    return;
  }
  if (payment.PaymentStatusID === PaymentStatus.SUCCESS) {
    logger.warn(
      `Crypto webhook: Payment ${payment.PaymentID} already marked as SUCCESS. Ignoring.`
    );
    return;
  }
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
    await paymentRepository.updatePaymentStatus(
      payment.PaymentID,
      newPaymentStatus,
      new Date(),
      paymentId.toString(),
      transaction
    );
    if (newPaymentStatus === PaymentStatus.SUCCESS) {
      await orderService.processSuccessfulOrder(
        orderId,
        payment.PaymentID,
        transaction
      );
    } else {
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
    if (transaction.active) {
      // Kiểm tra trước khi rollback
      await transaction.rollback();
    }
    logger.error(
      `Error processing Crypto webhook for OrderID ${orderId}:`,
      error
    );
    throw error;
  }
};

/**
 * Tạo đơn hàng trên PayPal.
 */
const createPayPalOrder = async (internalOrderId, accountId) => {
  const order = await orderRepository.findOrderByIdWithDetails(internalOrderId);
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
      'Thanh toán PayPal chỉ hỗ trợ cho đơn hàng USD.'
    );
  }
  const purchaseUnit = {
    amount: {
      currency_code: 'USD',
      value: new Decimal(order.FinalAmount).toDP(2).toString(),
    },
    description: `Payment for order #${order.OrderID} on 3T EduTech`,
    custom_id: order.OrderID.toString(),
  };
  const payPalOrder = await payPalUtil.createPayPalOrder(purchaseUnit);
  const rate = await exchangeRateService.getLatestRate('USD', 'VND');
  const convertedAmount = new Decimal(order.FinalAmount)
    .times(rate)
    .toDP(4)
    .toString();
  await paymentRepository.createCoursePayment({
    OrderID: internalOrderId,
    FinalAmount: order.FinalAmount,
    PaymentMethodID: 'PAYPAL',
    OriginalCurrencyID: 'USD',
    OriginalAmount: order.FinalAmount,
    ExternalTransactionID: payPalOrder.id,
    PaymentStatusID: PaymentStatus.PENDING,
    ConvertedCurrencyID: config.settings.baseCurrency,
    ConvertedTotalAmount: convertedAmount,
    ConversionRate: rate.toNumber(),
    TransactionFee: 0,
    AdditionalInfo: JSON.stringify({ payPalOrderId: payPalOrder.id }),
  });
  return { orderId: payPalOrder.id };
};

/**
 * Hoàn tất thanh toán PayPal và xử lý đơn hàng.
 */
const capturePayPalPayment = async (
  payPalOrderId,
  internalOrderId,
  accountId
) => {
  const order = await orderRepository.findOrderByIdWithDetails(internalOrderId);
  if (!order || order.AccountID !== accountId) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Đơn hàng không hợp lệ.');
  }
  if (order.OrderStatus === OrderStatus.COMPLETED) {
    logger.warn(`PayPal Capture: Order ${internalOrderId} already completed.`);
    return { message: 'Đơn hàng đã được xử lý trước đó.' };
  }
  const captureData = await payPalUtil.capturePayPalOrder(payPalOrderId);
  if (captureData.status !== 'COMPLETED') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Thanh toán PayPal chưa hoàn tất. Trạng thái: ${captureData.status}`
    );
  }
  const captureInfo = captureData.purchase_units[0].payments.captures[0];
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    let payment = await paymentRepository.findPaymentByExternalId(
      payPalOrderId,
      'PAYPAL'
    );
    if (payment) {
      await paymentRepository.updatePaymentStatus(
        payment.PaymentID,
        PaymentStatus.SUCCESS,
        new Date(captureInfo.create_time),
        captureInfo.id, // << TRUYỀN ID CỦA GIAO DỊCH CAPTURE VÀO ĐÂY
        transaction // << transaction giờ là tham số cuối cùng
      );
    } else {
      payment = await paymentRepository.createCoursePayment(
        {
          OrderID: internalOrderId,
          FinalAmount: captureInfo.amount.value,
          PaymentMethodID: 'PAYPAL',
          OriginalCurrencyID: captureInfo.amount.currency_code,
          OriginalAmount: captureInfo.amount.value,
          ExternalTransactionID: payPalOrderId, // Sử dụng transaction id thực tế từ PayPal
          TransactionFee: captureInfo.seller_receivable.paypal_fee.value,
          PaymentStatusID: PaymentStatus.SUCCESS,
          TransactionCompletedAt: new Date(captureInfo.create_time),
          AdditionalInfo: JSON.stringify({
            ...captureData,
            captureId: captureInfo.id,
          }),
        },
        transaction
      );
    }
    await orderService.processSuccessfulOrder(
      internalOrderId,
      payment.PaymentID,
      transaction
    );
    await transaction.commit();
    return {
      message: 'Payment completed successfully and you are now enrolled.',
      orderId: internalOrderId,
      paymentId: payment.PaymentID,
    };
  } catch (error) {
    await transaction.rollback();
    logger.error(
      `Error processing PayPal capture for order ${internalOrderId}:`,
      error
    );
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Xử lý đơn hàng sau thanh toán thất bại.'
    );
  }
};

/**
 * Tạo URL thanh toán MoMo cho một đơn hàng.
 */
const createMomoPaymentUrl = async (orderId, accountId) => {
  const isEnabled = await settingsService.getSettingValue('EnableMoMo', 'true');
  if (isEnabled !== 'true') {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Cổng thanh toán MoMo hiện không khả dụng.'
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
  if (order.CurrencyID !== 'VND') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Thanh toán MoMo chỉ hỗ trợ cho đơn hàng VND.'
    );
  }
  const uniqueMomoOrderId = `${order.OrderID.toString()}-${Date.now()}`;

  const paymentData = {
    amount: 10000 || order.FinalAmount,
    orderId: uniqueMomoOrderId,
    orderInfo: `Thanh toán cho đơn hàng #${order.OrderID}`,
    redirectUrl: `${config.frontendUrl}/payment/result?orderId=${order.OrderID}`,
    ipnUrl: `${config.serverUrl}/webhooks/momo`,
  };
  const momoResponse = await momoUtil.createPaymentRequest(paymentData);
  await paymentRepository.createCoursePayment({
    OrderID: orderId,
    FinalAmount: order.FinalAmount,
    PaymentMethodID: 'MOMO',
    OriginalCurrencyID: 'VND',
    OriginalAmount: order.FinalAmount,
    ExternalTransactionID: momoResponse.requestId,
    PaymentStatusID: PaymentStatus.PENDING,
    ConvertedCurrencyID: config.settings.baseCurrency,
    ConvertedTotalAmount: order.FinalAmount,
    ConversionRate: 1,
    AdditionalInfo: JSON.stringify({
      deepLink: momoResponse.deeplink,
      momoOrderId: uniqueMomoOrderId, // Lưu lại mã đã gửi cho MoMo để đối soát
    }),
  });
  return { paymentUrl: momoResponse.payUrl };
};

/**
 * Xử lý webhook từ MoMo.
 */
const processMomoWebhook = async (body) => {
  const isDevelopment = config.env === 'development';
  const signatureVerified = momoUtil.verifyIpnSignature(body);
  if (!signatureVerified && !isDevelopment) {
    // Ở môi trường Production, nếu chữ ký sai, BẮT BUỘC phải dừng lại.
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid MoMo IPN signature.');
  }

  if (!signatureVerified && isDevelopment) {
    // Ở môi trường Development, nếu chữ ký sai, chỉ ghi log cảnh báo và tiếp tục chạy.
    logger.warn(
      '!!! [DEV MODE] Bypassing MoMo IPN signature check for demo purposes. DO NOT USE IN PRODUCTION! !!!'
    );
  }
  const { orderId: momoOrderId, resultCode, transId, message } = body;
  const internalOrderIdStr = momoOrderId.split('-')[0];
  const internalOrderId = parseInt(internalOrderIdStr, 10);
  logger.info(
    `Processing MoMo IPN for OrderID: ${internalOrderId}, ResultCode: ${resultCode}, Message: ${message}`
  );
  const payment = await paymentRepository.findPendingPaymentByOrderId(
    internalOrderId,
    'MOMO'
  );
  if (!payment) {
    logger.error(
      `MoMo webhook: Payment for order ${internalOrderId} not found or not a MoMo payment.`
    );
    return;
  }
  if (payment.PaymentStatusID === PaymentStatus.SUCCESS) {
    logger.warn(
      `MoMo webhook: Payment ${payment.PaymentID} already marked as SUCCESS. Ignoring.`
    );
    return;
  }
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    if (resultCode === 0) {
      // Giao dịch thành công
      // Cập nhật bản ghi thanh toán với transId của MoMo
      await paymentRepository.updatePaymentStatus(
        payment.PaymentID,
        PaymentStatus.SUCCESS,
        new Date(),
        transId.toString(), // Chuyển thành chuỗi để đảm bảo
        transaction
      );

      // Xử lý đơn hàng thành công
      await orderService.processSuccessfulOrder(
        internalOrderId,
        payment.PaymentID,
        transaction
      );
    } else {
      await paymentRepository.updatePaymentStatus(
        payment.PaymentID,
        PaymentStatus.FAILED,
        new Date(),
        transId.toString(), // Chuyển thành chuỗi
        transaction
      );
      await orderRepository.updateOrderStatusAndPayment(
        internalOrderId,
        { OrderStatus: OrderStatus.FAILED },
        transaction
      );
      logger.warn(
        `MoMo payment failed for OrderID: ${internalOrderId}. Message: ${message}`
      );
    }

    await transaction.commit();
    logger.info(
      `Successfully processed MoMo webhook for OrderID: ${internalOrderId}.`
    );
  } catch (error) {
    if (transaction.active) {
      await transaction.rollback();
    }
    logger.error(
      `Error processing MoMo webhook for OrderID ${internalOrderId}:`,
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
  createPayPalOrder,
  capturePayPalPayment,
  createMomoPaymentUrl,
  processMomoWebhook,
};
