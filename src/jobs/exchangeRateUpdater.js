// File: src/jobs/exchangeRateUpdater.js

const cron = require('node-cron');
const logger = require('../utils/logger');
const exchangeRateService = require('../api/exchangeRates/exchangeRates.service');

/**
 * Schedule the exchange rate update job.
 */
const scheduleExchangeRateUpdate = () => {
  const cronSchedule = process.env.EXCHANGE_RATE_CRON_SCHEDULE || '17 0 * * *';

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
