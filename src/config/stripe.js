const Stripe = require('stripe');
const config = require('./index');
const logger = require('../utils/logger');

let stripeInstance = null;
if (config.stripe.secretKey) {
  stripeInstance = new Stripe(config.stripe.secretKey, {
    apiVersion: '2023-10-16', // Sử dụng phiên bản API cụ thể
  });
  logger.info('Stripe SDK initialized successfully.');
} else {
  logger.warn(
    'Stripe secret key is not configured. Stripe payments will fail.'
  );
}

module.exports = stripeInstance;
