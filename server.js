// Import dotenv để load biến môi trường từ file .env
require('dotenv').config();

// Import Express app từ src/app.js
const app = require('./src/app');
// Import logger (sẽ hoàn thiện sau)
const logger = require('./src/utils/logger');
// Import hàm kết nối DB (sẽ hoàn thiện sau)
const { connectDB, closeDB } = require('./src/database/connection');
const {
  schedulePendingOrderCancellation,
} = require('./src/jobs/pendingOrderCanceller');

// Lấy cổng từ biến môi trường hoặc dùng cổng mặc định 5000
const PORT = process.env.PORT || 5000;

let server;

// Hàm khởi động server
const startServer = async () => {
  try {
    // Kết nối tới database
    await connectDB();
    logger.info('Database connected successfully!');

    // Khởi động Express server
    server = app.listen(PORT, () => {
      logger.info(`Server listening on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
      logger.info(`Access API at: http://localhost:${PORT}`);
      // *** Lên lịch chạy cron job sau khi server đã khởi động ***
      // Chỉ chạy ở môi trường không phải test để tránh ảnh hưởng đến test DB
      if (process.env.NODE_ENV !== 'test') {
        schedulePendingOrderCancellation();
      }
    });
  } catch (error) {
    logger.error('Failed to connect to the database or start server:', error);
    process.exit(1); // Thoát nếu không kết nối được DB
  }
};

// Hàm đóng server và DB một cách an toàn
const shutdown = async (signal) => {
  logger.info(`${signal} received. Closing http server...`);
  if (server) {
    server.close(async () => {
      logger.info('Http server closed.');
      // Đóng kết nối database
      await closeDB();
      logger.info('Database connection closed.');
      process.exit(0);
    });
  } else {
    await closeDB();
    logger.info('Database connection closed.');
    process.exit(0);
  }
};

// Bắt các lỗi không mong muốn
const unexpectedErrorHandler = (error) => {
  logger.error('Unhandled Error:', error);
  // Cân nhắc có nên shutdown server khi gặp lỗi này không
  // shutdown('UnhandledError');
};

process.on('uncaughtException', unexpectedErrorHandler);
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Cân nhắc có nên shutdown server khi gặp lỗi này không
  // shutdown('UnhandledRejection');
});

// Bắt tín hiệu tắt từ hệ điều hành (ví dụ: Ctrl+C)
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Bắt đầu chạy server
startServer();
