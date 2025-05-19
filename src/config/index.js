const dotenv = require('dotenv');
const path = require('path');
const Joi = require('joi'); // Cài đặt Joi: npm install joi

// Load file .env tương ứng với môi trường
const envPath = path.join(__dirname, '../../.env'); // Luôn load file .env gốc
dotenv.config({ path: envPath });

// Định nghĩa schema để validate biến môi trường
const envVarsSchema = Joi.object()
  .keys({
    FRONTEND_URL: Joi.string()
      .uri()
      .description('Base URL of the frontend application'),
    NODE_ENV: Joi.string()
      .valid('production', 'development', 'test')
      .required(),
    PORT: Joi.number().default(5000),
    // Database
    DB_HOST: Joi.string().required().description('Database host'),
    DB_PORT: Joi.number().default(1433).description('Database port'),
    DB_USER: Joi.string().required().description('Database username'),
    DB_PASSWORD: Joi.string().required().description('Database password'),
    DB_NAME: Joi.string().required().description('Database name'),
    DB_ENCRYPT: Joi.boolean()
      .default(true)
      .description('Enable DB connection encryption'),
    DB_TRUST_SERVER_CERTIFICATE: Joi.boolean()
      .default(false)
      .description('Trust server certificate'),
    // JWT
    JWT_SECRET: Joi.string().required().description('JWT secret key'),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.number()
      .default(60)
      .description('Minutes after which access tokens expire'),
    JWT_REFRESH_EXPIRATION_DAYS: Joi.number()
      .default(30)
      .description('Days after which refresh tokens expire'),
    // Mailer (optional)
    MAIL_HOST: Joi.string().description('Server for sending emails'),
    MAIL_PORT: Joi.number().description('Port for email server'),
    MAIL_USER: Joi.string().description(
      'Username for email server (e.g., "apikey")'
    ), // Thêm gợi ý
    MAIL_PASSWORD: Joi.string().description(
      'Password for email server (e.g., SendGrid API Key)'
    ), // Thêm gợi ý
    MAIL_FROM: Joi.string().description(
      'Email address from which emails are sent (e.g., "App Name <noreply@domain.com>")'
    ), // Thêm gợi ý
    MAIL_ENCRYPTION: Joi.string()
      .valid('none', 'tls', 'ssl')
      .default('tls')
      .description('Email encryption method'), // Thêm encryption
    // Cloudinary (optional)
    CLOUDINARY_CLOUD_NAME: Joi.string().description('Cloudinary Cloud Name'),
    CLOUDINARY_API_KEY: Joi.string().description('Cloudinary API Key'),
    CLOUDINARY_API_SECRET: Joi.string().description('Cloudinary API Secret'),
    // VNPay (optional)
    VNP_TMNCODE: Joi.string().description('VNPay Terminal Code'),
    VNP_HASHSECRET: Joi.string().description('VNPay Hash Secret'),
    VNP_URL: Joi.string().uri().description('VNPay Payment Gateway URL'),
    VNP_API_URL: Joi.string().uri().description('VNPay API URL'), // Thêm cái này
    VNP_RETURN_URL: Joi.string().uri().description('VNPay Return URL'),
    VNP_IPN_URL: Joi.string().uri().description('VNPay IPN URL'),
    // Google OAuth (optional)
    GOOGLE_CLIENT_ID: Joi.string().description('Google OAuth Client ID'),
    GOOGLE_CLIENT_SECRET: Joi.string().description(
      'Google OAuth Client Secret'
    ),
    GOOGLE_CALLBACK_URL: Joi.string()
      .uri()
      .description('Google OAuth Callback URL'),
    // Facebook OAuth (optional)
    FACEBOOK_APP_ID: Joi.string().description('Facebook App ID'),
    FACEBOOK_APP_SECRET: Joi.string().description('Facebook App Secret'),
    FACEBOOK_CALLBACK_URL: Joi.string()
      .uri({ scheme: ['https'] })
      .description('Facebook OAuth Callback URL (HTTPS)'), // Bắt buộc HTTPS
  })
  .unknown(); // Cho phép các biến môi trường khác không được định nghĩa trong schema

// Validate biến môi trường
const { value: envVars, error } = envVarsSchema
  .prefs({ errors: { label: 'key' } })
  .validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

// Export cấu hình đã được validate
module.exports = {
  frontendUrl: envVars.FRONTEND_URL,
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  db: {
    host: envVars.DB_HOST,
    port: envVars.DB_PORT,
    user: envVars.DB_USER,
    password: envVars.DB_PASSWORD,
    database: envVars.DB_NAME,
    options: {
      encrypt: envVars.DB_ENCRYPT, // Bắt buộc cho Azure SQL
      trustServerCertificate: envVars.DB_TRUST_SERVER_CERTIFICATE, // Đặt là true nếu dùng self-signed cert (dev)
      // Các options khác nếu cần: instanceName, connectionTimeout, requestTimeout...
    },
  },
  jwt: {
    secret: envVars.JWT_SECRET,
    accessExpirationMinutes: envVars.JWT_ACCESS_EXPIRATION_MINUTES,
    refreshExpirationDays: envVars.JWT_REFRESH_EXPIRATION_DAYS,
    emailVerificationTokenExpiresMinutes: 60 * 24,
    // Có thể thêm các cấu hình khác: issuer, audience...
  },
  mailer: {
    host: envVars.MAIL_HOST,
    port: envVars.MAIL_PORT,
    auth: {
      // Auth object theo cấu trúc của Nodemailer
      user: envVars.MAIL_USER,
      pass: envVars.MAIL_PASSWORD,
    },
    from: envVars.MAIL_FROM,
    secure: envVars.MAIL_ENCRYPTION === 'ssl', // true for 465, false for other ports
    requireTLS: envVars.MAIL_ENCRYPTION === 'tls', // Require TLS for 587
    // Có thể thêm các options khác của Nodemailer nếu cần
    // tls: {
    //     ciphers:'SSLv3' // Ví dụ nếu cần cấu hình TLS cụ thể
    // }
  },
  cloudinary: {
    cloud_name: envVars.CLOUDINARY_CLOUD_NAME,
    api_key: envVars.CLOUDINARY_API_KEY,
    api_secret: envVars.CLOUDINARY_API_SECRET,
  },
  vnpay: {
    tmnCode: envVars.VNP_TMNCODE,
    hashSecret: envVars.VNP_HASHSECRET,
    url: envVars.VNP_URL,
    apiUrl: envVars.VNP_API_URL, // Thêm cái này
    returnUrl: envVars.VNP_RETURN_URL,
    ipnUrl: envVars.VNP_IPN_URL, // Thêm cái này
  },
  googleAuth: {
    clientID: envVars.GOOGLE_CLIENT_ID,
    clientSecret: envVars.GOOGLE_CLIENT_SECRET,
    callbackURL: envVars.GOOGLE_CALLBACK_URL,
  },
  facebookAuth: {
    clientID: envVars.FACEBOOK_APP_ID,
    clientSecret: envVars.FACEBOOK_APP_SECRET,
    callbackURL: envVars.FACEBOOK_CALLBACK_URL,
  },
  youtubeApiKey: process.env.YOUTUBE_API_KEY, // Thêm API Key cho YouTube
  appName: '3TEduTech', // Tên ứng dụng của bạn
};
