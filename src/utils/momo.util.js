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
  const lang = 'vi';

  // ================================================================
  // <<< BẢN SỬA LỖI 404 - Rà soát lại toàn bộ payload >>>
  // ================================================================

  // 1. Dữ liệu để tạo chữ ký
  const rawSignatureObject = {
    partnerCode: config.momo.partnerCode,
    accessKey: config.momo.accessKey,
    requestId,
    amount: amount.toString(),
    orderId,
    orderInfo,
    redirectUrl,
    ipnUrl,
    extraData,
    requestType,
  };

  const rawSignature = Object.keys(rawSignatureObject)
    .sort() // <<< ĐẢM BẢO SẮP XẾP KEY THEO ALPHABET
    .map((key) => `${key}=${rawSignatureObject[key]}`)
    .join('&');

  const signature = generateSignature(rawSignature, config.momo.secretKey);

  // 2. Body gửi đến MoMo
  const requestBody = {
    partnerCode: config.momo.partnerCode,
    requestId,
    amount, // MoMo API yêu cầu amount là number
    orderId,
    orderInfo,
    redirectUrl,
    ipnUrl,
    lang,
    extraData,
    requestType,
    signature,
  };

  const endpoint = '/v2/gateway/api/create'; // Endpoint API
  const url = `${config.momo.apiUrl}${endpoint}`;

  try {
    logger.info(
      `Sending create payment request to MoMo for OrderID: ${orderId}`
    );
    logger.debug('MoMo Endpoint:', url);
    logger.debug('MoMo Request Body:', requestBody);
    logger.debug('MoMo Raw Signature String:', rawSignature);

    const response = await axios.post(url, requestBody, {
      headers: { 'Content-Type': 'application/json' },
    });

    logger.info(`Received response from MoMo for OrderID: ${orderId}`);
    logger.debug('MoMo Response Data:', response.data);

    if (response.data.resultCode !== 0) {
      logger.error(
        `MoMo returned an error: ${response.data.message} (ResultCode: ${response.data.resultCode})`
      );
      throw new Error(`MoMo Error: ${response.data.message}`);
    }

    return response.data;
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message;
    const errorCode = error.response?.data?.resultCode || 'N/A';
    logger.error(
      `Error creating MoMo payment request for OrderID ${orderId}: ${errorMsg} (Code: ${errorCode})`
    );
    throw error;
  }
};
/**
 * Xác thực chữ ký IPN từ MoMo theo đúng tài liệu IPN v2.4 (ĐÚNG THỨ TỰ).
 * @param {object} body - Body của webhook request.
 * @returns {boolean} - True nếu chữ ký hợp lệ.
 */
const verifyIpnSignature = (body) => {
  const { signature: receivedSignature } = body;

  if (!config.momo.secretKey || !receivedSignature) {
    logger.error(
      'Cannot verify MoMo IPN: IPN_SECRET or received signature is missing.'
    );
    return false;
  }

  // ================================================================
  // <<< SỬA LỖI LẦN CUỐI CÙNG: XÂY DỰNG CHUỖI KÝ THEO ĐÚNG THỨ TỰ CỦA MOMO >>>
  // ================================================================

  // Lấy các giá trị, nếu không có thì dùng chuỗi rỗng
  const partnerCode = body.partnerCode || '';
  const accessKey = body.accessKey || '';
  const requestId = body.requestId || '';
  const amount = body.amount || '';
  const orderId = body.orderId || '';
  const orderInfo = body.orderInfo || '';
  const orderType = body.orderType || '';
  const transId = body.transId || '';
  const message = body.message || '';
  const localMessage = body.localMessage || '';
  const responseTime = body.responseTime || '';
  const errorCode = body.errorCode || ''; // resultCode chỉ có trong response tạo yêu cầu, IPN dùng errorCode
  const payType = body.payType || '';
  const extraData = body.extraData || '';

  // Tạo chuỗi ký theo ĐÚNG THỨ TỰ trong tài liệu của MoMo
  const rawSignature =
    `partnerCode=${partnerCode}` +
    `&accessKey=${accessKey}` +
    `&requestId=${requestId}` +
    `&amount=${amount}` +
    `&orderId=${orderId}` +
    `&orderInfo=${orderInfo}` +
    `&orderType=${orderType}` +
    `&transId=${transId}` +
    `&message=${message}` +
    `&localMessage=${localMessage}` +
    `&responseTime=${responseTime}` +
    `&errorCode=${errorCode}` +
    `&payType=${payType}` +
    `&extraData=${extraData}`;

  // ================================================================

  const expectedSignature = generateSignature(
    rawSignature,
    config.momo.secretKey
  );

  const isValid = receivedSignature === expectedSignature;

  if (!isValid) {
    logger.warn(`MoMo IPN Signature Mismatch!`);
    logger.debug(`Received Signature: ${receivedSignature}`);
    logger.debug(`Expected Signature: ${expectedSignature}`);
    logger.debug(`Raw String for Signature: ${rawSignature}`);
  } else {
    logger.info('MoMo IPN Signature Verified Successfully.');
  }

  return isValid;
};
module.exports = {
  createPaymentRequest,
  verifyIpnSignature,
};
