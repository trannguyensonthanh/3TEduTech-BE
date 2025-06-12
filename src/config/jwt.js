const config = require('./index');

module.exports = {
  secret: config.jwt.secret,
  accessExpirationMinutes: config.jwt.accessExpirationMinutes,
  refreshExpirationDays: config.jwt.refreshExpirationDays,
  verifyOptions: {},
  emailVerificationTokenExpiresMinutes: 60 * 24,
  passwordResetTokenExpiresMinutes: 60,
};
