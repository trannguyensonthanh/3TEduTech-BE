const crypto = require('crypto');
const moment = require('moment-timezone');
const qs = require('qs');
const config = require('../config').vnpay;
const logger = require('./logger');

function sortObject(obj) {
  const sorted = {};
  const str = [];
  let key;
  Object.keys(obj).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      str.push(encodeURIComponent(key));
    }
  });
  str.sort();
  for (key = 0; key < str.length; key += 1) {
    sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, '+');
  }
  return sorted;
}

/**
 * Tạo URL thanh toán VNPay.
 * @param {string} ipAddr - Địa chỉ IP của khách hàng.
 * @param {number} amount - Số tiền thanh toán (VNĐ).
 * @param {string} bankCode - Mã ngân hàng (optional).
 * @param {string} orderInfo - Thông tin đơn hàng.
 * @param {string} orderType - Loại đơn hàng (optional, vd: 'billpayment').
 * @param {string} locale - Ngôn ngữ ('vn' hoặc 'en').
 * @param {string} txnRef - Mã tham chiếu đơn hàng (OrderID).
 * @returns {string} - URL thanh toán VNPay.
 */
function createPaymentUrl(
  ipAddr,
  amount,
  orderInfo,
  txnRef,
  orderType = 'other',
  locale = 'vn',
  bankCode = ''
) {
  const date = new Date();
  const createDate = moment(date)
    .tz('Asia/Ho_Chi_Minh')
    .format('YYYYMMDDHHmmss');

  let paymentLocale = locale;
  if (!paymentLocale || ['vn', 'en'].indexOf(paymentLocale) === -1) {
    paymentLocale = 'vn';
  }

  const currCode = 'VND';
  let vnpParams = {};
  vnpParams.vnp_Version = '2.1.0';
  vnpParams.vnp_Command = 'pay';
  vnpParams.vnp_TmnCode = config.tmnCode;
  vnpParams.vnp_Locale = locale;
  vnpParams.vnp_CurrCode = currCode;
  vnpParams.vnp_TxnRef = txnRef;
  vnpParams.vnp_OrderInfo = orderInfo;
  vnpParams.vnp_OrderType = orderType;
  vnpParams.vnp_Amount = amount * 100;
  vnpParams.vnp_ReturnUrl =
    'https://guided-wallaby-measured.ngrok-free.app/v1/payments/vnpay_return';
  vnpParams.vnp_IpAddr = ipAddr;
  vnpParams.vnp_CreateDate = createDate;
  if (bankCode) {
    vnpParams.vnp_BankCode = bankCode;
  }

  vnpParams = sortObject(vnpParams);

  const signData = qs.stringify(vnpParams, { encode: false });

  const hmac = crypto.createHmac('sha512', config.hashSecret);
  const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
  vnpParams.vnp_SecureHash = signed;

  const paymentUrl = `${config.url}?${qs.stringify(vnpParams, { encode: false })}`;

  logger.info(`VNPay Payment URL created for Order ${txnRef}`);
  logger.debug(`VNPay Payment URL: ${paymentUrl}`);

  return paymentUrl;
}

/**
 * Xác thực chữ ký từ VNPay IPN hoặc Return URL.
 * @param {object} vnpParams - Object chứa các tham số từ VNPay (đã loại bỏ vnp_SecureHash).
 * @param {string} inputHash - Giá trị vnp_SecureHash nhận được từ VNPay.
 * @returns {boolean} - True nếu hợp lệ, False nếu không.
 */
function verifySignature(vnpParams, inputHash) {
  const secureHash = vnpParams.vnp_SecureHash;
  delete vnpParams.vnp_SecureHash;

  const sortedParams = sortObject(vnpParams);
  const signData = qs.stringify(sortedParams, { encode: false });

  const hmac = crypto.createHmac('sha512', config.hashSecret);
  const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

  if (secureHash) vnpParams.vnp_SecureHash = secureHash;

  const isValid = signed === inputHash;
  if (!isValid) {
    logger.warn(
      `VNPay Signature Verification Failed! Expected: ${signed}, Received: ${inputHash}`
    );
    logger.debug('VNPay Params for failed verification:', sortedParams);
  } else {
    logger.info('VNPay Signature Verification Success!');
  }
  return isValid;
}

module.exports = {
  createPaymentUrl,
  verifySignature,
};
