const nodemailer = require('nodemailer');
const path = require('path');

const { default: hbs } = require('nodemailer-express-handlebars');
const config = require('../config'); // Lấy config tổng
const logger = require('./logger');
// Tạo transporter object tái sử dụng được (chỉ tạo 1 lần)
// Chỉ tạo transporter nếu có đủ cấu hình mail
let transporter = null;
if (config.mailer.host && config.mailer.auth.user && config.mailer.auth.pass) {
  transporter = nodemailer.createTransport({
    host: config.mailer.host,
    port: config.mailer.port,
    secure: config.mailer.secure, // true for 465, false for other ports
    requireTLS: config.mailer.requireTLS,
    auth: {
      user: config.mailer.auth.user, // Tên đăng nhập SMTP (vd: 'apikey' cho SendGrid)
      pass: config.mailer.auth.pass, // Mật khẩu SMTP (vd: SendGrid API Key)
    },
    tls: {
      // Không bắt buộc nhưng đôi khi cần thiết, ví dụ nếu server mail yêu cầu
      rejectUnauthorized: config.env === 'production', // Chỉ kiểm tra cert nghiêm ngặt ở production
      // ciphers:'SSLv3' // Có thể cần thêm nếu nhà cung cấp yêu cầu
    },
  });
  // *** Cấu hình Handlebars cho Nodemailer ***
  const handlebarOptions = {
    viewEngine: {
      extname: '.hbs', // Phần mở rộng của file template
      partialsDir: path.resolve('./src/views/emails/partials/'), // Thư mục chứa partials (nếu có)
      layoutsDir: path.resolve('./src/views/emails/layouts/'), // Thư mục chứa layout (nếu có)
      defaultLayout: false, // Không dùng layout mặc định ở đây
    },
    viewPath: path.resolve('./src/views/emails/'), // Đường dẫn đến thư mục chứa template
    extName: '.hbs', // Phần mở rộng của file template
  };

  // Sử dụng middleware handlebars
  transporter.use('compile', hbs(handlebarOptions));
  // Kiểm tra kết nối (optional nhưng hữu ích khi khởi động)
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
    // Quyết định có nên throw lỗi hay chỉ log? Tạm thời chỉ log.
    // throw new Error('Mailer is not configured.');
    return; // Không gửi nếu chưa config
  }

  const mailOptions = {
    from: config.mailer.from,
    to,
    subject,
    template, // Tên file template (ví dụ: 'verifyAccount')
    context: {
      // Dữ liệu sẽ được truyền vào template
      ...context,
      appName: '3TEduTech', // Thêm tên app vào context chung
      // Thêm các biến chung khác nếu cần (vd: logoUrl, websiteUrl)
    },
    // attachments: [] // Có thể thêm attachments nếu cần
  };

  console.log('Sending email with options:', mailOptions); // Log thông tin gửi email

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent successfully to ${to}: ${info.messageId}`);
    // logger.debug('Send mail result:', info); // Log chi tiết nếu cần debug
  } catch (error) {
    logger.error(`Error sending email to ${to}:`, error);
    // Cân nhắc có nên throw lỗi ở đây không, tùy thuộc vào độ quan trọng của email
    // throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Không thể gửi email.');
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
  const verificationLink = `${config.frontendUrl}/verify-email?token=${verificationToken}`; // URL trên frontend xử lý token
  const subject = `Xác thực tài khoản ${config.appName || '3TEduTech'}`;
  const context = {
    fullNameOrDefault: fullName || 'bạn',
    verificationLink,
    // appName đã có trong context chung
  };
  await sendEmailWithTemplate(toEmail, subject, 'verifyAccount', context); // Gọi template 'verifyAccount'
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
    // appName đã có trong context chung
  };
  await sendEmailWithTemplate(toEmail, subject, 'resetPassword', context); // Gọi template 'resetPassword'
};
// Thêm các hàm gửi email khác nếu cần (ví dụ: thông báo khóa học mới, thông báo giao dịch,...)

module.exports = {
  // sendEmail, // Export hàm gốc nếu cần dùng trực tiếp
  sendEmailWithTemplate, // Export hàm gửi bằng template
  sendVerificationEmail,
  sendPasswordResetEmail,
};
