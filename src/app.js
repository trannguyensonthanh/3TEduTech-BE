const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const httpStatus = require('http-status').status;
const cookieParser = require('cookie-parser');
const { webhookRouter } = require('./api/orders/orders.routes');
const config = require('./config');
const logger = require('./utils/logger');
const {
  errorConverter,
  errorHandler,
} = require('./middlewares/error.middleware');
const ApiError = require('./core/errors/ApiError');
const currencyHandler = require('./middlewares/currency.middleware');

const app = express();

if (config.env === 'development') {
  app.use(
    morgan('dev', {
      stream: { write: (message) => logger.http(message.trim()) },
    })
  );
} else {
  app.use(
    morgan('combined', {
      stream: { write: (message) => logger.http(message.trim()) },
    })
  );
}

app.use(helmet());

const allowedOrigins = [
  'http://192.168.87.105:8080',
  'https://localhost:8080',
  'http://localhost:8080',
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Currency',
  ],
};

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(currencyHandler);
app.use('/webhooks', webhookRouter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const apiV1Router = express.Router();

apiV1Router.get('/', (req, res) => {
  res.status(httpStatus.OK).send({
    message: `API V1 is running smoothly! Environment: ${config.env}`,
    timestamp: new Date().toISOString(),
  });
});

const authRoutes = require('./api/auth/auth.routes');
const userRoutes = require('./api/users/users.routes');
const categoryRoutes = require('./api/categories/categories.routes');
const levelRoutes = require('./api/levels/levels.routes');
const courseRoutes = require('./api/courses/courses.routes');
const enrollmentRoutes = require('./api/enrollments/enrollments.routes');
const progressRoutes = require('./api/progress/progress.routes');
const { lessonRouter } = require('./api/lessons/lessons.routes');
const quizRoutes = require('./api/quizzes/quizzes.routes');
const { questionRouter } = require('./api/lessons/lessons.routes');
const cartRoutes = require('./api/carts/carts.routes');
const { orderRouter } = require('./api/orders/orders.routes');
const paymentRoutes = require('./api/payments/payments.routes');
const financialsRoutes = require('./api/financials/financials.routes');
const promotionRoutes = require('./api/promotions/promotions.routes');
const { reviewRouter } = require('./api/reviews/reviews.routes');
const { discussionRouter } = require('./api/discussions/discussions.routes');
const instructorRoutes = require('./api/instructors/instructors.routes');
const skillsRoutes = require('./api/skills/skills.routes');
const settingsRoutes = require('./api/settings/settings.routes');
const notificationRoutes = require('./api/notifications/notifications.routes');
const approvalRequestRoutes = require('./api/approvalRequests/approvalRequests.routes');
const languageRoutes = require('./api/languages/languages.routes');
const currencyRoutes = require('./api/currencies/currencies.routes');
const exchangeRateRoutes = require('./api/exchangeRates/exchangeRates.routes');
const paymentMethodRoutes = require('./api/payments/paymentMethod.routes');
const adminRoutes = require('./api/admin/admin.routes');
const eventRoutes = require('./api/events/events.routes');

apiV1Router.use('/auth', authRoutes);
apiV1Router.use('/users', userRoutes);
apiV1Router.use('/categories', categoryRoutes);
apiV1Router.use('/levels', levelRoutes);
apiV1Router.use('/courses', courseRoutes);
apiV1Router.use('/lessons', lessonRouter);
apiV1Router.use('/enrollments', enrollmentRoutes);
apiV1Router.use('/progress', progressRoutes);
apiV1Router.use('/quizzes', quizRoutes);
apiV1Router.use('/quiz-questions', questionRouter);
apiV1Router.use('/cart', cartRoutes);
apiV1Router.use('/orders', orderRouter);
apiV1Router.use('/payments', paymentRoutes);
apiV1Router.use('/financials', financialsRoutes);
apiV1Router.use('/promotions', promotionRoutes);
apiV1Router.use('/reviews', reviewRouter);
apiV1Router.use('/discussions', discussionRouter);
apiV1Router.use('/instructors', instructorRoutes);
apiV1Router.use('/skills', skillsRoutes);
apiV1Router.use('/settings', settingsRoutes);
apiV1Router.use('/notifications', notificationRoutes);
apiV1Router.use('/approval-requests', approvalRequestRoutes);
apiV1Router.use('/languages', languageRoutes);
apiV1Router.use('/currencies', currencyRoutes);
apiV1Router.use('/exchange-rates', exchangeRateRoutes);
apiV1Router.use('/payment-methods', paymentMethodRoutes);
apiV1Router.use('/admin', adminRoutes);
apiV1Router.use('/events', eventRoutes);
app.use('/v1', apiV1Router);

app.use((req, res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, `Not Found - ${req.originalUrl}`));
});

app.use(errorConverter);
app.use(errorHandler);

module.exports = app;
