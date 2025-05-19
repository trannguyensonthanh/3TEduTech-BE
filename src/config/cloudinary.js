const cloudinary = require('cloudinary').v2;
const config = require('./index');
const logger = require('../utils/logger');

if (
  !config.cloudinary.cloud_name ||
  !config.cloudinary.api_key ||
  !config.cloudinary.api_secret
) {
  logger.warn(
    'Cloudinary configuration is incomplete. File uploads will likely fail.'
  );
} else {
  cloudinary.config({
    cloud_name: config.cloudinary.cloud_name,
    api_key: config.cloudinary.api_key,
    api_secret: config.cloudinary.api_secret,
    secure: true, // Sử dụng HTTPS
  });
  logger.info('Cloudinary configured successfully.');
}

module.exports = cloudinary;
