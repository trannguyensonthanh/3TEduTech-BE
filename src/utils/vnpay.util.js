const crypto = require('crypto');
const moment = require('moment-timezone');
const qs = require('qs');
const config = require('../config').vnpay;
const logger = require('./logger');

// Hàm sort chuẩn của VNPAY
function sortObject(obj) {
  const sorted = {};
  const str = [];
  let key;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) {
      str.push(encodeURIComponent(key));
    }
  }
  str.sort();
  for (key = 0; key < str.length; key++) {
    sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, '+');
  }
  return sorted;
}

// Hàm createPaymentUrl đã được chứng minh là đúng
function createPaymentUrl(ipAddr, amount, orderInfo, txnRef, options = {}) {
  const {
    orderType = 'other',
    locale = 'vn',
    bankCode = '',
    returnUrl = config.returnUrl,
  } = options;

  const createDate = moment(new Date())
    .tz('Asia/Ho_Chi_Minh')
    .format('YYYYMMDDHHmmss');
  const vnpLocale = ['vn', 'en'].includes(locale) ? locale : 'vn';

  const vnpParams = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: config.tmnCode,
    vnp_Locale: vnpLocale,
    vnp_CurrCode: 'VND',
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: orderType,
    vnp_Amount: amount * 100,
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: createDate,
  };

  if (bankCode) {
    vnpParams.vnp_BankCode = bankCode;
  }

  const sortedParams = sortObject(vnpParams);
  const signData = qs.stringify(sortedParams, { encode: false });
  const hmac = crypto.createHmac('sha512', config.hashSecret);
  const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

  vnpParams.vnp_SecureHash = signed; // Chú ý: Thêm hash vào object GỐC, không phải object đã sort

  const paymentUrl = `${config.url}?${qs.stringify(vnpParams, { encode: true })}`;

  logger.info(`VNPay Payment URL created for Order ${txnRef}`);
  logger.debug(`FINAL, CORRECT URL SHOULD BE: ${paymentUrl}`);

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
