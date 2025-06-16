// File: src/config/db.js (Phiên bản Cải Tiến)

const sql = require('mssql');
const config = require('../config').db;
const logger = require('../utils/logger');

const dbConfig = {
  user: config.user,
  password: config.password,
  server: config.host,
  database: config.database,
  port: config.port,
  options: {
    ...config.options,
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  requestTimeout: 30000,
  connectionTimeout: 30000,
};

let pool = null;
// Thêm một biến cờ để quản lý trạng thái đang kết nối, giải quyết "race condition"
let isConnecting = false;

// Đóng pool kết nối
const closeDB = async () => {
  try {
    if (pool) {
      await pool.close();
      pool = null;
      logger.info('Database connection pool closed.');
    }
  } catch (err) {
    logger.error('Error closing database pool:', err);
    // Dù có lỗi khi đóng, vẫn reset pool để có thể thử lại
    pool = null;
  }
};

// Lấy kết nối từ pool
const getConnection = async () => {
  // Nếu không có pool hoặc pool đã bị đóng, hãy gọi connectDB
  if (!pool || !pool.connected) {
    // connectDB sẽ xử lý logic để tránh tạo nhiều pool cùng lúc
    return connectDB();
  }
  return pool;
};

// Kết nối DB và tạo pool
const connectDB = async () => {
  // Nếu đã có pool và đang kết nối tốt, trả về ngay
  if (pool && pool.connected) {
    return pool;
  }

  // Nếu một request khác đang trong quá trình kết nối, hãy chờ nó
  if (isConnecting) {
    // Chúng ta sẽ chờ một chút và thử lại để lấy pool đã được tạo bởi request kia
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    return getConnection(); // Gọi lại getConnection để kiểm tra lại trạng thái
  }

  // Đánh dấu là đang bắt đầu quá trình kết nối
  isConnecting = true;

  try {
    logger.info('Creating new database connection pool...');
    pool = new sql.ConnectionPool(dbConfig);

    // Gắn sự kiện lỗi TRƯỚC khi kết nối
    pool.on('error', (err) => {
      logger.error('Database pool error:', err);
      // Khi có lỗi, chỉ cần đóng pool. Lần gọi getConnection tiếp theo sẽ tự động tạo lại.
      closeDB();
    });

    await pool.connect();
    logger.info('Database connection pool created successfully.');

    // Đặt lại cờ sau khi kết nối thành công
    isConnecting = false;
    return pool;
  } catch (err) {
    logger.error('Database connection failed:', err);
    // Đặt lại cờ và pool nếu kết nối thất bại
    isConnecting = false;
    pool = null;
    // Ném lỗi ra ngoài để hàm gọi nó biết mà xử lý, thay vì exit cả tiến trình
    throw err;
  }
};

// Thêm một hàm để khởi tạo khi server bắt đầu (khuyến khích sử dụng)
const initializeDatabase = async () => {
  try {
    await getConnection();
  } catch (error) {
    logger.error('Failed to initialize database on startup. Exiting...');
    process.exit(1);
  }
};

module.exports = {
  // Giữ nguyên các hàm bạn đang dùng
  connectDB, // Hàm này vẫn có thể được gọi để khởi tạo
  closeDB,
  getConnection,
  sql,

  // Thêm hàm initializeDatabase để bạn có thể gọi lúc khởi động server (tùy chọn)
  initializeDatabase,
};
