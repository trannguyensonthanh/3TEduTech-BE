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
  requestTimeout: 60000, // Tăng thời gian chờ request lên 60 giây (60000ms)
  connectionTimeout: 30000, // Thời gian chờ kết nối
};

let pool = null;

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
  }
};

// Kết nối DB và tạo pool
const connectDB = async () => {
  try {
    if (!pool) {
      logger.info('Creating database connection pool...');
      pool = await new sql.ConnectionPool(dbConfig).connect();
      logger.info('Database connection pool created successfully.');

      pool.on('error', (err) => {
        logger.error('Database pool error:', err);
        closeDB().then(() => {
          pool = null;
          logger.warn('Attempting to reconnect database...');
        });
      });
    }
    return pool;
  } catch (err) {
    logger.error('Database connection failed:', err);
    process.exit(1);
  }
};

// Lấy kết nối từ pool
const getConnection = async () => {
  if (!pool) {
    await connectDB();
  }
  return pool;
};

module.exports = {
  connectDB,
  closeDB,
  getConnection,
  sql,
};
