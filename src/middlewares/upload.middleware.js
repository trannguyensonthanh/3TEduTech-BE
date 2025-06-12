const multer = require('multer');
const httpStatus = require('http-status').status;
const ApiError = require('../core/errors/ApiError');

// Sử dụng memoryStorage vì chúng ta sẽ upload ngay lên Cloudinary
const storage = multer.memoryStorage();

/**
 * Hàm lọc file chung
 */
const fileFilter = (allowedTypes) => (req, file, cb) => {
  const allowedMimeTypes = Array.isArray(allowedTypes)
    ? allowedTypes
    : [allowedTypes];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new ApiError(
        httpStatus.BAD_REQUEST,
        `Loại file không hợp lệ. Chỉ chấp nhận: ${allowedMimeTypes.join(', ')}`
      ),
      false
    );
  }
};

/**
 * Giới hạn kích thước file
 */
const createLimits = (maxSizeMB) => ({
  fileSize: maxSizeMB * 1024 * 1024,
});

const imageFilter = fileFilter(
  ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  5
);
const imageLimits = createLimits(5);
const uploadImage = multer({
  storage,
  fileFilter: imageFilter,
  limits: imageLimits,
});

const videoFilter = fileFilter(
  ['video/mp4', 'video/x-msvideo', 'video/quicktime', 'video/webm'],
  500
);
const videoLimits = createLimits(500);
const uploadVideo = multer({
  storage,
  fileFilter: videoFilter,
  limits: videoLimits,
});

const attachmentFilter = fileFilter(
  [
    'application/pdf',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/plain',
    'text/javascript',
    'text/css',
    'text/html',
    'image/jpeg',
    'image/png',
  ],
  50
);
const attachmentLimits = createLimits(50);
const uploadAttachment = multer({
  storage,
  fileFilter: attachmentFilter,
  limits: attachmentLimits,
});

/**
 * Middleware xử lý lỗi của Multer
 */
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    let message = 'Lỗi upload file không xác định.';
    const statusCode = httpStatus.BAD_REQUEST;
    if (err.code === 'LIMIT_FILE_SIZE') {
      let maxSize;
      if (err.field === 'video') {
        maxSize = videoLimits.fileSize / (1024 * 1024);
      } else if (err.field === 'attachment') {
        maxSize = attachmentLimits.fileSize / (1024 * 1024);
      } else {
        maxSize = imageLimits.fileSize / (1024 * 1024);
      }
      message = `File quá lớn. Kích thước tối đa cho phép là ${maxSize}MB.`;
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Số lượng file hoặc tên trường file không đúng.';
    }
    return next(new ApiError(statusCode, message));
  }
  if (err instanceof ApiError) {
    return next(err);
  }
  if (err) {
    return next(
      new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Lỗi trong quá trình upload file.'
      )
    );
  }
  next();
};

module.exports = {
  uploadImage,
  uploadVideo,
  uploadAttachment,
  handleMulterError,
};
