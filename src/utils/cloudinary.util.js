const cloudinary = require('../config/cloudinary');
const logger = require('./logger');

/**
 * Tạo Signed URL cho tài nguyên video private trên Cloudinary.
 * @param {string} publicId - Public ID của video.
 * * @param {object} options - Tùy chọn bổ sung.
 * @param {number} options.expiresIn - Thời gian hết hạn của URL tính bằng giây (ví dụ: 3600 cho 1 giờ). Mặc định 1 giờ.
 * @returns {string} - Signed URL hoặc ném lỗi nếu thất bại.
 */
const generateSignedVideoUrl = (publicId, options = {}) => {
  try {
    const expiresIn = options.expiresIn || 3600;
    const expirationTimestamp = Math.floor(Date.now() / 1000) + expiresIn;

    const signedUrl = cloudinary.video(publicId, {
      resource_type: 'video',
      type: 'private',
      sign_url: true,
      expires_at: expirationTimestamp,
    });

    if (!signedUrl) {
      throw new Error('Failed to generate signed URL from Cloudinary SDK.');
    }

    logger.info(
      `Generated signed URL for ${publicId} expiring at ${new Date(expirationTimestamp * 1000)}`
    );
    return signedUrl;
  } catch (error) {
    logger.error(`Error generating signed URL for ${publicId}:`, error);
    throw new Error('Không thể tạo đường dẫn xem video.');
  }
};

/**
 * Tạo URL đã ký (signed URL) cho tài nguyên Cloudinary, đặc biệt hữu ích cho các tài nguyên private.
 * URL này phù hợp để nhúng vào thẻ <video>, <img> hoặc truy cập trực tiếp trong thời gian giới hạn.
 *
 * @param {string} publicId Public ID của tài nguyên trên Cloudinary.
 * @param {GenerateSignedUrlOptions} options Các tùy chọn để tạo URL.
 * @returns {string} Signed URL.
 * @throws {Error} Nếu thiếu API secret hoặc có lỗi trong quá trình tạo URL.
 */
const generateSignedUrl = (publicId, options = {}) => {
  const apiSecret = cloudinary.config().api_secret;
  if (!apiSecret) {
    logger.error(
      'Cloudinary API secret is missing. Cannot generate signed URL.'
    );
    throw new Error('Cloudinary configuration error: API secret is required.');
  }

  if (!publicId) {
    logger.error('Public ID is required to generate signed URL.');
    throw new Error('Public ID cannot be empty.');
  }

  const resourceType = options.resource_type || 'video';
  const deliveryType = options.type || 'private';
  const expiresIn = options.expires_in || 3600;
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

  const signOptions = {
    resource_type: resourceType,
    type: deliveryType,
    expires_at: expiresAt,
    secure: true,
    sign_url: true,
    transformation: options.transformation || [
      { fetch_format: 'auto', quality: 'auto' },
      { video_codec: 'auto' },
    ],
  };

  if (resourceType === 'raw') {
    delete signOptions.transformation;
  }

  try {
    const signedUrl = cloudinary.utils.url(publicId, signOptions);

    logger.info(
      `Generated signed URL for public_id="${publicId}", resource_type="${resourceType}", type="${deliveryType}". Expires: ${new Date(expiresAt * 1000).toISOString()}`
    );
    return signedUrl;
  } catch (error) {
    logger.error(
      `Error generating signed URL for public_id="${publicId}":`,
      error
    );
    throw new Error(`Could not generate signed URL: ${error.message || error}`);
  }
};

/**
 * Upload file lên Cloudinary từ buffer.
 * @param {Buffer} buffer - Buffer của file.
 * @param {object} options - Các tùy chọn cho Cloudinary (folder, public_id, resource_type,...).
 * @returns {Promise<object>} - Kết quả từ Cloudinary (bao gồm secure_url, public_id,...).
 */
const uploadStream = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      resource_type: options.resource_type || 'auto',
      folder: options.folder,
      public_id: options.public_id,
      overwrite: options.overwrite !== undefined ? options.overwrite : true,
      type: options.type || 'upload',
    };

    Object.keys(uploadOptions).forEach(
      (key) => uploadOptions[key] === undefined && delete uploadOptions[key]
    );

    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          logger.error('Cloudinary upload error:', error);
          return reject(error);
        }
        if (result) {
          logger.info(`Cloudinary upload successful: ${result.public_id}`);
          resolve(result);
        } else {
          logger.error('Cloudinary upload did not return a result.');
          reject(new Error('Cloudinary upload failed without specific error.'));
        }
      }
    );
    stream.end(buffer);
  });
};

/**
 * Xóa asset khỏi Cloudinary bằng public_id.
 * Sử dụng async/await để code sạch hơn.
 *
 * @param {string} publicId - Public ID của asset cần xóa.
 * @param {DeleteAssetOptions} options - Các tùy chọn (chỉ cần resource_type).
 * @returns {Promise<object>} - Kết quả từ Cloudinary API (ví dụ: { result: 'ok' }).
 * @throws {Error} Nếu có lỗi trong quá trình xóa.
 */
const deleteAsset = async (publicId, options = {}) => {
  if (!cloudinary.config().api_secret || !cloudinary.config().api_key) {
    logger.error(
      'Cloudinary API key or secret is missing. Cannot delete asset.'
    );
    throw new Error(
      'Cloudinary configuration error: API key and secret are required.'
    );
  }
  if (!publicId) {
    logger.error('Public ID is required to delete asset.');
    throw new Error('Public ID cannot be empty.');
  }

  const resourceType = options.resource_type || 'image';

  try {
    logger.info(
      `Attempting to delete Cloudinary asset: public_id="${publicId}", resource_type="${resourceType}"`
    );

    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true,
    });

    logger.info(
      `Cloudinary delete result for public_id="${publicId}" (${resourceType}):`,
      result
    );

    if (result?.result !== 'ok' && result?.result !== 'not found') {
      logger.warn(
        `Cloudinary delete for ${publicId} returned unexpected result:`,
        result
      );
    }

    return result;
  } catch (error) {
    logger.error(
      `Cloudinary delete error for public_id="${publicId}" (${resourceType}):`,
      error
    );
    throw new Error(
      `Failed to delete Cloudinary asset: ${error.message || error}`
    );
  }
};

module.exports = {
  uploadStream,
  deleteAsset,
  generateSignedVideoUrl,
  generateSignedUrl,
};
