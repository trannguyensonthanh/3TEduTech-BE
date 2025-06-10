const dotenv = require('dotenv');
const path = require('path');
const Joi = require('joi');

const envPath = path.join(__dirname, '../../.env');
dotenv.config({ path: envPath });

const envVarsSchema = Joi.object()
  .keys({
    FRONTEND_URL: Joi.string()
      .uri()
      .description('Base URL of the frontend application'),
    NODE_ENV: Joi.string()
      .valid('production', 'development', 'test')
      .required(),
    PORT: Joi.number().default(5000),
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
    JWT_SECRET: Joi.string().required().description('JWT secret key'),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.number()
      .default(60)
      .description('Minutes after which access tokens expire'),
    JWT_REFRESH_EXPIRATION_DAYS: Joi.number()
      .default(30)
      .description('Days after which refresh tokens expire'),
    MAIL_HOST: Joi.string().description('Server for sending emails'),
    MAIL_PORT: Joi.number().description('Port for email server'),
    MAIL_USER: Joi.string().description('Username for email server'),
    MAIL_PASSWORD: Joi.string().description('Password for email server'),
    MAIL_FROM: Joi.string().description(
      'Email address from which emails are sent'
    ),
    MAIL_ENCRYPTION: Joi.string()
      .valid('none', 'tls', 'ssl')
      .default('tls')
      .description('Email encryption method'),
    CLOUDINARY_CLOUD_NAME: Joi.string().description('Cloudinary Cloud Name'),
    CLOUDINARY_API_KEY: Joi.string().description('Cloudinary API Key'),
    CLOUDINARY_API_SECRET: Joi.string().description('Cloudinary API Secret'),
    VNP_TMNCODE: Joi.string().description('VNPay Terminal Code'),
    VNP_HASHSECRET: Joi.string().description('VNPay Hash Secret'),
    VNP_URL: Joi.string().uri().description('VNPay Payment Gateway URL'),
    VNP_API_URL: Joi.string().uri().description('VNPay API URL'),
    VNP_RETURN_URL: Joi.string().uri().description('VNPay Return URL'),
    VNP_IPN_URL: Joi.string().uri().description('VNPay IPN URL'),
    GOOGLE_CLIENT_ID: Joi.string().description('Google OAuth Client ID'),
    GOOGLE_CLIENT_SECRET: Joi.string().description(
      'Google OAuth Client Secret'
    ),
    GOOGLE_CALLBACK_URL: Joi.string()
      .uri()
      .description('Google OAuth Callback URL'),
    FACEBOOK_APP_ID: Joi.string().description('Facebook App ID'),
    FACEBOOK_APP_SECRET: Joi.string().description('Facebook App Secret'),
    FACEBOOK_CALLBACK_URL: Joi.string()
      .uri({ scheme: ['https'] })
      .description('Facebook OAuth Callback URL (HTTPS)'),
    NOWPAYMENTS_API_KEY: Joi.string().description('NOWPayments API Key'),
    NOWPAYMENTS_IPN_SECRET: Joi.string().description('NOWPayments IPN Secret'),
    NOWPAYMENTS_API_URL: Joi.string()
      .uri()
      .default('https://api.nowpayments.io/v1'),
  })
  .unknown();

const { value: envVars, error } = envVarsSchema
  .prefs({ errors: { label: 'key' } })
  .validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

module.exports = {
  serverUrl: envVars.SERVER_URL,
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
      encrypt: envVars.DB_ENCRYPT,
      trustServerCertificate: envVars.DB_TRUST_SERVER_CERTIFICATE,
    },
  },
  jwt: {
    secret: envVars.JWT_SECRET,
    accessExpirationMinutes: envVars.JWT_ACCESS_EXPIRATION_MINUTES,
    refreshExpirationDays: envVars.JWT_REFRESH_EXPIRATION_DAYS,
    emailVerificationTokenExpiresMinutes: 60 * 24,
  },
  mailer: {
    host: envVars.MAIL_HOST,
    port: envVars.MAIL_PORT,
    auth: {
      user: envVars.MAIL_USER,
      pass: envVars.MAIL_PASSWORD,
    },
    from: envVars.MAIL_FROM,
    secure: envVars.MAIL_ENCRYPTION === 'ssl',
    requireTLS: envVars.MAIL_ENCRYPTION === 'tls',
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
    apiUrl: envVars.VNP_API_URL,
    returnUrl: envVars.VNP_RETURN_URL,
    ipnUrl: envVars.VNP_IPN_URL,
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
  youtubeApiKey: process.env.YOUTUBE_API_KEY,
  appName: '3TEduTech',
  settings: {
    baseCurrency: 'VND',
  },
  stripe: {
    publicKey: envVars.STRIPE_PUBLIC_KEY,
    secretKey: envVars.STRIPE_SECRET_KEY,
    webhookSecret: envVars.STRIPE_WEBHOOK_SECRET,
  },
  exchangeRateApiKey: envVars.EXCHANGE_RATE_API_KEY,
  nowPayments: {
    apiKey: envVars.NOWPAYMENTS_API_KEY,
    ipnSecret: envVars.NOWPAYMENTS_IPN_SECRET,
    apiUrl: envVars.NOWPAYMENTS_API_URL,
  },
};
