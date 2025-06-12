const nodemailer = require('nodemailer');
const path = require('path');

const { default: hbs } = require('nodemailer-express-handlebars');
const config = require('../config');
const logger = require('./logger');

let transporter = null;
if (config.mailer.host && config.mailer.auth.user && config.mailer.auth.pass) {
  transporter = nodemailer.createTransport({
    host: config.mailer.host,
    port: config.mailer.port,
    secure: config.mailer.secure,
    requireTLS: config.mailer.requireTLS,
    auth: {
      user: config.mailer.auth.user,
      pass: config.mailer.auth.pass,
    },
    tls: {
      rejectUnauthorized: config.env === 'production',
    },
  });
  const handlebarOptions = {
    viewEngine: {
      extname: '.hbs',
      partialsDir: path.resolve('./src/views/emails/partials/'),
      layoutsDir: path.resolve('./src/views/emails/layouts/'),
      defaultLayout: false,
    },
    viewPath: path.resolve('./src/views/emails/'),
    extName: '.hbs',
  };

  transporter.use('compile', hbs(handlebarOptions));
  transporter.verify((error, success) => {
    if (error) {
      logger.error('Nodemailer transporter verification failed:', error);
    } else {
      logger.info('Nodemailer transporter is ready to send emails.');
    }
  });
} else {
  logger.warn('Mailer configuration is incomplete. Email sending is disabled.');
}

/**
 * Gửi email.
 * @param {string} to - Địa chỉ email người nhận.
 * @param {string} subject - Tiêu đề email.
 * @param {string} text - Nội dung email dạng text thuần.
 * @param {string} html - Nội dung email dạng HTML.
 * @returns {Promise<void>}
 */
const sendEmailWithTemplate = async (to, subject, template, context) => {
  if (!transporter) {
    logger.error(`Email not sent to ${to}: Mailer is not configured.`);
    return;
  }

  const mailOptions = {
    from: config.mailer.from,
    to,
    subject,
    template,
    context: {
      ...context,
      appName: '3TEduTech',
    },
  };

  console.log('Sending email with options:', mailOptions);

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent successfully to ${to}: ${info.messageId}`);
  } catch (error) {
    logger.error(`Error sending email to ${to}:`, error);
  }
};

/**
 * Gửi email xác thực tài khoản.
 * @param {string} toEmail - Email người nhận.
 * @param {string} fullName - Tên người nhận.
 * @param {string} verificationToken - Token xác thực.
 * @returns {Promise<void>}
 */
const sendVerificationEmail = async (toEmail, fullName, verificationToken) => {
  const verificationLink = `${config.frontendUrl}/verify-email?token=${verificationToken}`;
  const subject = `Xác thực tài khoản ${config.appName || '3TEduTech'}`;
  const context = {
    fullNameOrDefault: fullName || 'bạn',
    verificationLink,
  };
  await sendEmailWithTemplate(toEmail, subject, 'verifyAccount', context);
};

/**
 * Gửi email hướng dẫn reset mật khẩu (sử dụng template).
 * @param {string} toEmail
 * @param {string} fullName
 * @param {string} resetToken
 * @returns {Promise<void>}
 */
const sendPasswordResetEmail = async (toEmail, fullName, resetToken) => {
  const resetLink = `${config.frontendUrl}/reset-password?token=${resetToken}`;
  const subject = `Đặt lại mật khẩu tài khoản ${config.appName || '[Tên App]'}`;
  const expirationMinutes = config.jwt.passwordResetTokenExpiresMinutes || 60;
  const context = {
    fullNameOrDefault: fullName || 'bạn',
    resetLink,
    expirationMinutes,
  };
  await sendEmailWithTemplate(toEmail, subject, 'resetPassword', context);
};

module.exports = {
  sendEmailWithTemplate,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
