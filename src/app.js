const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const httpStatus = require('http-status').status;

const cookieParser = require('cookie-parser');
const passport = require('./config/passport');
const config = require('./config'); // Sẽ tạo file config
const logger = require('./utils/logger'); // Sẽ tạo logger
const {
  errorConverter,
  errorHandler,
} = require('./middlewares/error.middleware'); // Sẽ tạo middleware lỗi
const ApiError = require('./core/errors/ApiError'); // Sẽ tạo lớp lỗi

// --- Khởi tạo Express App ---
const app = express();

// --- Middlewares ---

// Ghi log HTTP requests (chỉ trong môi trường development)
if (config.env === 'development') {
  // Morgan 'dev' format: :method :url :status :response-time ms - :res[content-length]
  app.use(
    morgan('dev', {
      stream: { write: (message) => logger.http(message.trim()) },
    })
  );
} else {
  // Morgan 'combined' format cho production (có thể tùy chỉnh)
  app.use(
    morgan('combined', {
      stream: { write: (message) => logger.http(message.trim()) },
    })
  );
}

// Bảo mật cơ bản với Helmet (thiết lập các HTTP headers an toàn)
app.use(helmet());

// Cho phép Cross-Origin Resource Sharing (CORS)
// Cấu hình chặt chẽ hơn cho production nếu cần
const corsOptions = {
  origin: 'http://localhost:8080', // Replace with your frontend's URL
  credentials: true, // Allow credentials (cookies, authorization headers, etc.)
};
app.use(cors(corsOptions));
app.options(/(.*)/, cors(corsOptions)); // Cho phép pre-flight requests
// *** SỬ DỤNG COOKIE PARSER ***
// Middleware này cần đặt TRƯỚC các route sử dụng req.cookies
app.use(cookieParser());
// Parse JSON request body
app.use(express.json({ limit: '10mb' })); // Giới hạn kích thước body (điều chỉnh nếu cần)

// Parse URL-encoded request body
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Phục vụ file tĩnh nếu có (ví dụ: ảnh upload nếu không dùng cloud)
// app.use('/static', express.static(path.join(__dirname, '../public')));

// *** KHỞI TẠO PASSPORT ***
// app.use(passport.initialize());
// --- API Routes ---
// Tiền tố chung cho các API version 1
const apiV1Router = express.Router();

// Route kiểm tra sức khỏe hệ thống (Health Check)
apiV1Router.get('/', (req, res) => {
  res.status(httpStatus.OK).send({
    message: `API V1 is running smoothly! Environment: ${config.env}`,
    timestamp: new Date().toISOString(),
  });
});

// --- Gắn các routes của từng module vào đây ---
const authRoutes = require('./api/auth/auth.routes');
const userRoutes = require('./api/users/users.routes');
const categoryRoutes = require('./api/categories/categories.routes'); // Thêm dòng này
const levelRoutes = require('./api/levels/levels.routes'); // Thêm dòng này
const courseRoutes = require('./api/courses/courses.routes');
const enrollmentRoutes = require('./api/enrollments/enrollments.routes'); // Thêm
const progressRoutes = require('./api/progress/progress.routes'); // Thêm
const { lessonRouter } = require('./api/lessons/lessons.routes');
const quizRoutes = require('./api/quizzes/quizzes.routes'); // Routes cho student actions
const { questionRouter } = require('./api/lessons/lessons.routes'); // Routes cho question management
const cartRoutes = require('./api/carts/carts.routes'); // Thêm
const { orderRouter, webhookRouter } = require('./api/orders/orders.routes'); // Thêm
const paymentRoutes = require('./api/payments/payments.routes');
const financialsRoutes = require('./api/financials/financials.routes');
const promotionRoutes = require('./api/promotions/promotions.routes');
const { reviewRouter } = require('./api/reviews/reviews.routes');
const { discussionRouter } = require('./api/discussions/discussions.routes'); // Import router chính
const instructorRoutes = require('./api/instructors/instructors.routes'); // Thêm
const skillsRoutes = require('./api/skills/skills.routes');
const settingsRoutes = require('./api/settings/settings.routes');
const notificationRoutes = require('./api/notifications/notifications.routes');
const approvalRequestRoutes = require('./api/approvalRequests/approvalRequests.routes');
const languageRoutes = require('./api/languages/languages.routes');

apiV1Router.use('/auth', authRoutes); // Gắn route auth vào /v1/auth
apiV1Router.use('/users', userRoutes); // Gắn route users vào /v1/users
apiV1Router.use('/categories', categoryRoutes); // Gắn route categories vào /v1/categories
apiV1Router.use('/levels', levelRoutes);
apiV1Router.use('/courses', courseRoutes);
apiV1Router.use('/lessons', lessonRouter);
apiV1Router.use('/enrollments', enrollmentRoutes); // Gắn vào /v1/enrollments
apiV1Router.use('/progress', progressRoutes); // Gắn vào /v1/progress
apiV1Router.use('/quizzes', quizRoutes); // Gắn student quiz routes vào /v1/quizzes
apiV1Router.use('/quiz-questions', questionRouter); // Gắn question management routes vào /v1/quiz-questions
apiV1Router.use('/cart', cartRoutes); // Gắn vào /v1/cart
apiV1Router.use('/orders', orderRouter); // Gắn vào /v1/orders
apiV1Router.use('/payments', paymentRoutes); // Gắn vào /v1/payments
apiV1Router.use('/financials', financialsRoutes);
apiV1Router.use('/promotions', promotionRoutes);
apiV1Router.use('/reviews', reviewRouter);
apiV1Router.use('/discussions', discussionRouter); // Gắn route chính
// apiV1Router.use('/quiz-questions', questionRouter); // Giữ lại route quản lý question riêng
apiV1Router.use('/instructors', instructorRoutes); // Gắn vào /v1/instructors
apiV1Router.use('/skills', skillsRoutes);
apiV1Router.use('/settings', settingsRoutes);
apiV1Router.use('/notifications', notificationRoutes);
apiV1Router.use('/approval-requests', approvalRequestRoutes);
apiV1Router.use('/languages', languageRoutes);
// Gắn router V1 vào đường dẫn /v1
app.use('/v1', apiV1Router);
app.use('/webhooks', webhookRouter); // Gắn webhook router vào /webhooks
// --- Error Handling Middlewares ---

// Middleware bắt các route không tồn tại (404) sau khi đã thử tất cả các route V1
app.use((req, res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, `Not Found - ${req.originalUrl}`));
});

// Middleware chuyển đổi các lỗi thông thường thành ApiError (nếu cần)
app.use(errorConverter);

// Middleware xử lý lỗi tập trung (phải đặt cuối cùng)
app.use(errorHandler);

module.exports = app;
