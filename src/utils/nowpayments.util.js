const axios = require('axios');
const crypto = require('crypto');
const httpStatus = require('http-status').status;
const config = require('../config');
const logger = require('./logger');
const ApiError = require('../core/errors/ApiError');

/**
 * Tạo một hóa đơn thanh toán trên NOWPayments.
 * @param {object} invoiceData - Dữ liệu hóa đơn { price_amount, price_currency, pay_currency, order_id, order_description, ipn_callback_url, ... }
 * @returns {Promise<object>} - Dữ liệu trả về từ NOWPayments.
 */
const createPaymentInvoice = async (invoiceData) => {
  if (!config.nowPayments.apiKey) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'NOWPayments API Key is not configured.'
    );
  }

  const url = `${config.nowPayments.apiUrl}/payment`;
  const headers = {
    'x-api-key': config.nowPayments.apiKey,
    'Content-Type': 'application/json',
  };

  try {
    logger.info(
      `Sending create invoice request to NOWPayments for OrderID: ${invoiceData.order_id}`
    );
    logger.debug('NOWPayments request body:', invoiceData);

    const response = await axios.post(url, invoiceData, { headers });

    logger.info(
      `Received response from NOWPayments for OrderID: ${invoiceData.order_id}`
    );
    logger.debug('NOWPayments response data:', response.data);

    return response.data;
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message;
    logger.error(
      `Error creating NOWPayments invoice for OrderID ${invoiceData.order_id}: ${errorMsg}`,
      error.response?.data
    );
    throw new ApiError(
      error.response?.status || httpStatus.INTERNAL_SERVER_ERROR,
      `NOWPayments Error: ${errorMsg}`
    );
  }
};

/**
 * Xác thực chữ ký IPN từ NOWPayments.
 * Logic này tuân thủ yêu cầu của NOWPayments: tạo HMAC từ chuỗi JSON có key đã được sắp xếp.
 * @param {string} signature - Header 'x-nowpayments-sig' từ request.
 * @param {object} rawBody - Body của request webhook (đã được parse).
 * @returns {boolean} - True nếu chữ ký hợp lệ.
 */
const verifyIpnSignature = (signature, rawBody) => {
  if (!config.nowPayments.ipnSecret) {
    logger.error(
      'Cannot verify NOWPayments IPN: IPN_SECRET is not configured.'
    );
    return false;
  }

  if (!rawBody || rawBody.length === 0 || !signature) {
    logger.error(
      'NOWPayments IPN Verification Failed: Invalid raw body or missing signature in util.'
    );
    return false;
  }

  try {
    const hmac = crypto.createHmac('sha512', config.nowPayments.ipnSecret);
    hmac.update(rawBody);
    const generatedSignature = hmac.digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(generatedSignature),
      Buffer.from(signature)
    );

    if (!isValid) {
      logger.warn(
        `NOWPayments IPN Signature Mismatch. Received: ${signature}, Generated: ${generatedSignature}`
      );
      logger.debug(
        'IPN Raw Body for failed verification:',
        rawBody.toString('utf-8')
      );
    } else {
      logger.info('NOWPayments IPN Signature Verified Successfully.');
    }

    return isValid;
  } catch (error) {
    logger.error(
      'Exception during NOWPayments IPN signature verification:',
      error
    );
    return false;
  }
};
module.exports = {
  createPaymentInvoice,
  verifyIpnSignature,
};
