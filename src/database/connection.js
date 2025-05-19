const sql = require('mssql');
const config = require('../config').db; // Lấy cấu hình DB từ file config
const logger = require('../utils/logger');

// Cấu hình pool kết nối
const dbConfig = {
  user: config.user,
  password: config.password,
  server: config.host,
  database: config.database,
  port: config.port,
  options: {
    ...config.options, // Bao gồm encrypt và trustServerCertificate từ config
    enableArithAbort: true, // Thường cần thiết cho SQL Server
  },
  pool: {
    max: 10, // Số lượng kết nối tối đa trong pool
    min: 0, // Số lượng kết nối tối thiểu
    idleTimeoutMillis: 30000, // Thời gian kết nối nhàn rỗi trước khi bị đóng
  },
};

// Tạo pool kết nối toàn cục
let pool = null;
const closeDB = async () => {
  try {
    if (pool) {
      await pool.close();
      pool = null; // Đặt lại pool sau khi đóng
      logger.info('Database connection pool closed.');
    }
  } catch (err) {
    logger.error('Error closing database pool:', err);
  }
};

const connectDB = async () => {
  try {
    if (!pool) {
      logger.info('Creating database connection pool...');
      pool = await new sql.ConnectionPool(dbConfig).connect();
      logger.info('Database connection pool created successfully.');

      pool.on('error', (err) => {
        logger.error('Database pool error:', err);
        // Cố gắng kết nối lại hoặc xử lý lỗi khác
        // Có thể cần đóng pool và tạo lại
        closeDB().then(() => {
          pool = null; // Reset pool để connectDB tạo lại
          logger.warn('Attempting to reconnect database...');
          // Có thể thêm logic retry ở đây
        });
      });
    }
    return pool;
  } catch (err) {
    logger.error('Database connection failed:', err);
    // Thoát ứng dụng nếu không kết nối được lần đầu
    process.exit(1);
    // Hoặc throw lỗi để server.js xử lý
    // throw err;
  }
};

// Hàm tiện ích để lấy kết nối từ pool
const getConnection = async () => {
  if (!pool) {
    await connectDB(); // Đảm bảo pool đã được tạo
  }
  // Không cần gọi pool.request() ở đây, sẽ gọi khi cần thực hiện query
  return pool;
};

module.exports = {
  connectDB,
  closeDB,
  getConnection,
  sql, // Export kiểu dữ liệu SQL để sử dụng khi cần (ví dụ: sql.VarChar)
};
