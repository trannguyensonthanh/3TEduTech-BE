require('dotenv').config();

const app = require('./src/app');
const logger = require('./src/utils/logger');
const { connectDB, closeDB } = require('./src/database/connection');
const {
  schedulePendingOrderCancellation,
} = require('./src/jobs/pendingOrderCanceller');
const {
  scheduleExchangeRateUpdate,
} = require('./src/jobs/exchangeRateUpdater');

const PORT = process.env.PORT || 5000;

let server;

const startServer = async () => {
  try {
    await connectDB();
    logger.info('Database connected successfully!');

    server = app.listen(PORT, () => {
      logger.info(`Server listening on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
      logger.info(`Access API at: http://localhost:${PORT}`);
      if (process.env.NODE_ENV !== 'test') {
        schedulePendingOrderCancellation();
        scheduleExchangeRateUpdate();
      }
    });
  } catch (error) {
    logger.error('Failed to connect to the database or start server:', error);
    process.exit(1);
  }
};

const shutdown = async (signal) => {
  logger.info(`${signal} received. Closing http server...`);
  if (server) {
    server.close(async () => {
      logger.info('Http server closed.');
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

const unexpectedErrorHandler = (error) => {
  logger.error('Unhandled Error:', error);
};

process.on('uncaughtException', unexpectedErrorHandler);
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer();
