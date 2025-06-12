const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('./logger');

/**
 * Tạo chữ ký HMAC SHA256 cho request MoMo.
 * @param {string} rawSignature - Chuỗi dữ liệu thô cần ký.
 * @param {string} secretKey - Khóa bí mật từ MoMo.
 * @returns {string} - Chữ ký đã tạo.
 */
const generateSignature = (rawSignature, secretKey) => {
  return crypto
    .createHmac('sha256', secretKey)
    .update(rawSignature)
    .digest('hex');
};

/**
 * Tạo một yêu cầu thanh toán trên MoMo.
 * @param {object} paymentData - Dữ liệu cho yêu cầu thanh toán.
 * @returns {Promise<object>} - Dữ liệu trả về từ MoMo, bao gồm payUrl.
 */
const createPaymentRequest = async (paymentData) => {
  if (
    !config.momo.partnerCode ||
    !config.momo.accessKey ||
    !config.momo.secretKey
  ) {
    throw new Error('MoMo configuration is incomplete.');
  }

  const { amount, orderId, orderInfo, redirectUrl, ipnUrl } = paymentData;
  const requestId = uuidv4();
  const requestType = 'captureWallet';
  const extraData = '';

  const rawSignature = `accessKey=${config.momo.accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${ipnUrl}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${config.momo.partnerCode}&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=${requestType}`;

  const signature = generateSignature(rawSignature, config.momo.secretKey);

  const requestBody = {
    partnerCode: config.momo.partnerCode,
    accessKey: config.momo.accessKey,
    requestId,
    amount,
    orderId,
    orderInfo,
    redirectUrl,
    ipnUrl,
    extraData,
    requestType,
    signature,
    lang: 'vi',
  };

  try {
    logger.info(
      `Sending create payment request to MoMo for OrderID: ${orderId}`
    );
    logger.debug('MoMo request body:', requestBody);

    const response = await axios.post(
      `${config.momo.apiUrl}/v2/gateway/api/create`,
      requestBody
    );

    logger.info(`Received response from MoMo for OrderID: ${orderId}`);
    logger.debug('MoMo response data:', response.data);

    if (response.data.resultCode !== 0) {
      throw new Error(
        `MoMo Error: ${response.data.message} (ResultCode: ${response.data.resultCode})`
      );
    }

    return response.data;
  } catch (error) {
    logger.error(
      `Error creating MoMo payment request for OrderID ${orderId}:`,
      error.message
    );
    throw error;
  }
};

/**
 * Xác thực chữ ký IPN từ MoMo.
 * @param {object} requestBody - Body của webhook request.
 * @returns {boolean} - True nếu chữ ký hợp lệ.
 */
const verifyIpnSignature = (requestBody) => {
  const { signature: receivedSignature, ...rest } = requestBody;

  const rawSignature = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key]}`)
    .join('&');
  const expectedSignature = generateSignature(
    rawSignature,
    config.momo.secretKey
  );

  const isValid = receivedSignature === expectedSignature;

  if (!isValid) {
    logger.warn(
      `MoMo IPN Signature Mismatch. Received: ${receivedSignature}, Expected: ${expectedSignature}`
    );
  } else {
    logger.info('MoMo IPN Signature Verified Successfully.');
  }

  return isValid;
};

module.exports = {
  createPaymentRequest,
  verifyIpnSignature,
};
