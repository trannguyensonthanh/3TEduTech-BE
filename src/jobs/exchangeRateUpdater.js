// File: src/jobs/exchangeRateUpdater.js

const cron = require('node-cron');
const logger = require('../utils/logger');
const exchangeRateService = require('../api/exchangeRates/exchange-rates.service');

const scheduleExchangeRateUpdate = () => {
  // Chạy mỗi ngày vào lúc 21:02 (9h02 tối, giờ server)
  const cronSchedule = process.env.EXCHANGE_RATE_CRON_SCHEDULE || '3 21 * * *';

  if (cron.validate(cronSchedule)) {
    cron.schedule(cronSchedule, () => {
      logger.info(
        `[CRON_JOB] Triggering updateExchangeRates job with schedule: ${cronSchedule}`
      );
      exchangeRateService.updateExchangeRates().catch((err) => {
        logger.error(
          '[CRON_JOB] Unhandled error during scheduled exchange rate update:',
          err
        );
      });
    });
    logger.info(
      `[CRON_JOB] Scheduled job for updating exchange rates with schedule: ${cronSchedule}.`
    );
  } else {
    logger.error(
      `[CRON_JOB] Invalid cron schedule for exchange rates: ${cronSchedule}. Job not scheduled.`
    );
  }
};

module.exports = {
  scheduleExchangeRateUpdate,
};
