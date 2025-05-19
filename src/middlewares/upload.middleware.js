const multer = require('multer');
const httpStatus = require('http-status').status;
const ApiError = require('../core/errors/ApiError');

// Sử dụng memoryStorage vì chúng ta sẽ upload ngay lên Cloudinary
const storage = multer.memoryStorage();

// Hàm lọc file chung
const fileFilter = (allowedTypes) => (req, file, cb) => {
  const allowedMimeTypes = Array.isArray(allowedTypes)
    ? allowedTypes
    : [allowedTypes];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true); // Chấp nhận file
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

// Giới hạn kích thước file
const createLimits = (maxSizeMB) => ({
  fileSize: maxSizeMB * 1024 * 1024, // Chuyển MB sang bytes
});

// Cấu hình riêng cho từng loại upload

// Ảnh (thumbnail) - ví dụ chấp nhận jpeg, png, gif, tối đa 5MB
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

// Video - ví dụ chấp nhận mp4, avi, mov, tối đa 500MB
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

// File đính kèm (đa dạng hơn) - ví dụ pdf, zip, doc, ppt, code files, tối đa 50MB
const attachmentFilter = fileFilter(
  [
    'application/pdf',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
    'application/msword', // doc
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
    'application/vnd.ms-powerpoint', // ppt
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
    'application/vnd.ms-excel', // xls
    'text/plain',
    'text/javascript',
    'text/css',
    'text/html',
    // Thêm các loại file code khác nếu cần
    'image/jpeg',
    'image/png', // Cho phép ảnh trong attachment
  ],
  50
);
const attachmentLimits = createLimits(50);
const uploadAttachment = multer({
  storage,
  fileFilter: attachmentFilter,
  limits: attachmentLimits,
});

// Middleware xử lý lỗi của Multer
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
    // Lỗi từ fileFilter (vd: loại file không hợp lệ)
    return next(err);
  }
  if (err) {
    // Lỗi khác
    return next(
      new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Lỗi trong quá trình upload file.'
      )
    );
  }
  next(); // Không có lỗi multer
};

module.exports = {
  uploadImage,
  uploadVideo,
  uploadAttachment,
  handleMulterError,
};
