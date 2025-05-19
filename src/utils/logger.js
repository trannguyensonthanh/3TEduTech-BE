const winston = require('winston');
const path = require('path');
// Tạo thư mục logs nếu chưa tồn tại
const fs = require('fs');
const config = require('../config'); // Import cấu hình

// Định nghĩa các level log (theo chuẩn RFC5424)
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Chọn level log dựa trên môi trường
const level = () => {
  const env = config.env || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'warn'; // Log nhiều hơn khi dev, ít hơn khi prod
};

// Định nghĩa màu sắc cho các level (cho console)
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};
winston.addColors(colors);

// Định dạng log
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  // Định dạng màu chỉ áp dụng cho console
  winston.format.colorize({ all: true }),
  // Định dạng khi in ra: timestamp level: message
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Định nghĩa các "transports" (nơi ghi log: console, file...)
const transports = [
  // Luôn ghi ra console
  new winston.transports.Console({
    stderrLevels: ['error'], // Ghi lỗi ra stderr
  }),
  // Ghi tất cả log lỗi vào file error.log
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: winston.format.uncolorize(), // Không cần màu trong file
  }),
  // Ghi tất cả log (từ level đã chọn trở xuống) vào file all.log
  new winston.transports.File({
    filename: 'logs/all.log',
    format: winston.format.uncolorize(),
  }),
];

// Tạo instance logger
const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
  exitOnError: false, // Không thoát ứng dụng khi có lỗi ghi log
});

const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

module.exports = logger;
