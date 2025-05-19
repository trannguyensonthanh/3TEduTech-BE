const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const lessonValidation = require('./lessons.validation');
const lessonController = require('./lessons.controller');
const {
  authenticate,
  authorize,
} = require('../../middlewares/auth.middleware');
const Roles = require('../../core/enums/Roles');
const passUserIfAuthenticated = require('../../middlewares/passUserIfAuthenticated');
const {
  uploadVideo,
  uploadAttachment,
  handleMulterError,
} = require('../../middlewares/upload.middleware');
const subtitleRoutes = require('./subtitle.routes'); // *** Import subtitle routes ***
const { lessonDiscussionRouter } = require('../discussions/discussions.routes');
const quizController = require('../quizzes/quizzes.controller'); // *** THÊM IMPORT ***
const quizValidation = require('../quizzes/quizzes.validation'); // *** THÊM IMPORT ***
// Router cho các thao tác trên lesson cụ thể, không lồng vào section
const router = express.Router();

// Các thao tác cần biết lessonId
router
  .route('/:lessonId')
  .get(
    // Lấy chi tiết lesson (có thể public hoặc cần login tùy logic free preview)
    passUserIfAuthenticated,
    validate(lessonValidation.getLesson),
    lessonController.getLesson
  )
  .patch(
    // Cập nhật lesson (Instructor/Admin)
    authenticate,
    authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),

    validate(lessonValidation.updateLesson),

    lessonController.updateLesson
  )
  .delete(
    // Xóa lesson (Instructor/Admin)
    authenticate,
    authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),
    validate(lessonValidation.deleteLesson),
    lessonController.deleteLesson
  );
// *** Mount subtitle routes ***
router.use('/:lessonId/subtitles', subtitleRoutes);
// --- Thêm Routes quản lý câu hỏi Quiz cho lesson ---
// Chỉ Instructor/Admin mới được truy cập
const quizManagementRouter = express.Router({ mergeParams: true }); // mergeParams để lấy lessonId
quizManagementRouter.use(
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN])
);

quizManagementRouter.post(
  '/questions', // Tạo câu hỏi mới ( kế cả các options )
  validate(quizValidation.createQuestion), // Validation dùng lessonId từ params
  quizController.createQuestion
);
quizManagementRouter.get(
  '/questions', // Lấy danh sách câu hỏi
  // No validation needed for params here, lessonId is from parent
  quizController.getQuestions
);
// Gắn router quản lý quiz vào lesson
router.use('/:lessonId/quiz', quizManagementRouter);

// Router cho thao tác trên questionId cụ thể
const questionRouter = express.Router();
questionRouter.use(
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN])
);

questionRouter
  .route('/:questionId')
  .patch(
    // Cập nhật câu hỏi (kể cả options )
    validate(quizValidation.updateQuestion),
    quizController.updateQuestion
  )
  .delete(
    // Xóa câu hỏi ( kể cả options )
    validate(quizValidation.deleteQuestion),
    quizController.deleteQuestion
  );
// *** Mount discussion routes vào lesson ***
router.use('/:lessonId/discussions', lessonDiscussionRouter);

// Router cho thao tác trên questionId cụ thể (questionRouter)
const questionMgmtRouter = express.Router({ mergeParams: true }); // Tạo router mới ở đây
questionMgmtRouter.use(
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN])
);
questionMgmtRouter
  .route('/')
  .post(
    // Tạo câu hỏi mới
    validate(quizValidation.createQuestion),
    quizController.createQuestion
  )
  .get(
    // Lấy danh sách câu hỏi
    quizController.getQuestions
  );
router.use('/:lessonId/quiz/questions', questionMgmtRouter); // Mount vào đây
// Router cho các thao tác liên quan đến section (tạo lesson, sắp xếp)
// Router này sẽ được mount vào route của section
const sectionScopedRouter = express.Router({ mergeParams: true }); // mergeParams để lấy sectionId

sectionScopedRouter.post(
  '/', // Tạo lesson mới trong section
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),

  validate(lessonValidation.createLesson),
  lessonController.createLesson
);

sectionScopedRouter.get(
  '/', // Lấy danh sách lesson của section
  passUserIfAuthenticated,
  validate(lessonValidation.getLessons),
  lessonController.getLessons
);

sectionScopedRouter.patch(
  '/order', // Cập nhật thứ tự lesson trong section
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),
  validate(lessonValidation.updateLessonsOrder),
  lessonController.updateLessonsOrder
);

// --- Thêm Route Upload Video ---
router.patch(
  '/:lessonId/video',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),
  uploadVideo.single('video'), // Middleware nhận file từ field 'video'
  handleMulterError,
  lessonController.updateLessonVideo // Controller mới sẽ tạo
);

// --- Routes cho Attachments ---
router.post(
  '/:lessonId/attachments', // Tạo attachment mới
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),
  uploadAttachment.single('attachment'), // Middleware nhận file từ field 'attachment'
  handleMulterError,
  lessonController.addLessonAttachment // Controller mới sẽ tạo
);

router.delete(
  '/:lessonId/attachments/:attachmentId', // Xóa attachment
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),
  // Không cần multer ở đây
  lessonController.deleteLessonAttachment // Controller mới sẽ tạo
);

// *** THÊM ROUTE LẤY SIGNED URL ***
router.get(
  '/:lessonId/video-url',
  authenticate, // Phải đăng nhập để lấy URL private
  validate(lessonValidation.getLesson), // Dùng validation của getLesson (chỉ cần lessonId)
  lessonController.getLessonVideoUrl // Controller mới
);

module.exports = {
  lessonRouter: router, // Router cho thao tác trên lessonId
  sectionScopedLessonRouter: sectionScopedRouter, // Router cho thao tác trong context của sectionId
  questionRouter,
};
