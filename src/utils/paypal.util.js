const axios = require('axios');
const qs = require('qs');
const httpStatus = require('http-status').status;
const config = require('../config');
const logger = require('./logger');
const ApiError = require('../core/errors/ApiError');

const tokenCache = {
  accessToken: null,
  expiresAt: 0,
};

/**
 * Lấy Access Token từ PayPal, sử dụng cache nếu có.
 * @returns {Promise<string>} - PayPal Access Token.
 */
const getPayPalAccessToken = async () => {
  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt > now) {
    return tokenCache.accessToken;
  }

  if (!config.paypal.clientId || !config.paypal.clientSecret) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'PayPal client ID or secret is not configured.'
    );
  }

  const auth = Buffer.from(
    `${config.paypal.clientId}:${config.paypal.clientSecret}`
  ).toString('base64');
  const url = `${config.paypal.apiUrl}/v1/oauth2/token`;
  const data = qs.stringify({ grant_type: 'client_credentials' });
  logger.debug('PayPal access token response:', config.paypal.clientId);
  try {
    logger.info('Requesting new PayPal access token...');
    const response = await axios.post(url, data, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`,
      },
    });

    const { access_token: accessToken, expires_in: expiresIn } = response.data;
    tokenCache.accessToken = accessToken;
    tokenCache.expiresAt = now + (expiresIn - 300) * 1000;

    logger.info('Successfully obtained new PayPal access token.');
    return accessToken;
  } catch (error) {
    const errorMsg = error.response?.data?.error_description || error.message;
    logger.error('Failed to get PayPal access token:', errorMsg);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `PayPal Auth Error: ${errorMsg}`
    );
  }
};

/**
 * Tạo một đơn hàng trên PayPal.
 * @param {object} purchaseUnit - Dữ liệu đơn hàng.
 * @returns {Promise<object>} - Dữ liệu đơn hàng từ PayPal.
 */
const createPayPalOrder = async (purchaseUnit) => {
  const accessToken = await getPayPalAccessToken();
  const url = `${config.paypal.apiUrl}/v2/checkout/orders`;

  const payload = {
    intent: 'CAPTURE',
    purchase_units: [purchaseUnit],
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.data;
  } catch (error) {
    const errorMsg =
      error.response?.data?.details?.[0]?.description ||
      error.response?.data?.message ||
      error.message;
    logger.error(
      'Error creating PayPal order:',
      error.response?.data || error.message
    );
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `PayPal Create Order Error: ${errorMsg}`
    );
  }
};

/**
 * Hoàn tất (Capture) một đơn hàng trên PayPal.
 * @param {string} payPalOrderId - ID đơn hàng của PayPal.
 * @returns {Promise<object>} - Dữ liệu giao dịch đã hoàn tất từ PayPal.
 */
const capturePayPalOrder = async (payPalOrderId) => {
  const accessToken = await getPayPalAccessToken();
  const url = `${config.paypal.apiUrl}/v2/checkout/orders/${payPalOrderId}/capture`;

  try {
    const response = await axios.post(
      url,
      {},
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    const errorMsg =
      error.response?.data?.details?.[0]?.description ||
      error.response?.data?.message ||
      error.message;
    logger.error(
      `Error capturing PayPal order ${payPalOrderId}:`,
      error.response?.data || error.message
    );
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `PayPal Capture Error: ${errorMsg}`
    );
  }
};

module.exports = {
  createPayPalOrder,
  capturePayPalOrder,
};
