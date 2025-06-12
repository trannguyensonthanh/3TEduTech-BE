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
const subtitleRoutes = require('./subtitle.routes');
const { lessonDiscussionRouter } = require('../discussions/discussions.routes');
const quizController = require('../quizzes/quizzes.controller');
const quizValidation = require('../quizzes/quizzes.validation');

const router = express.Router();

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

router.use('/:lessonId/subtitles', subtitleRoutes);

const quizManagementRouter = express.Router({ mergeParams: true });
quizManagementRouter.use(
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN])
);

quizManagementRouter.post(
  '/questions',
  validate(quizValidation.createQuestion),
  quizController.createQuestion
);
quizManagementRouter.get('/questions', quizController.getQuestions);

router.use('/:lessonId/quiz', quizManagementRouter);

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

router.use('/:lessonId/discussions', lessonDiscussionRouter);

const questionMgmtRouter = express.Router({ mergeParams: true });
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
router.use('/:lessonId/quiz/questions', questionMgmtRouter);

const sectionScopedRouter = express.Router({ mergeParams: true });

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

router.patch(
  '/:lessonId/video',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),
  uploadVideo.single('video'),
  handleMulterError,
  lessonController.updateLessonVideo
);

router.post(
  '/:lessonId/attachments',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),
  uploadAttachment.single('attachment'),
  handleMulterError,
  lessonController.addLessonAttachment
);

router.delete(
  '/:lessonId/attachments/:attachmentId',
  authenticate,
  authorize([Roles.INSTRUCTOR, Roles.ADMIN, Roles.SUPERADMIN]),
  lessonController.deleteLessonAttachment
);

router.get(
  '/:lessonId/video-url',
  authenticate,
  validate(lessonValidation.getLesson),
  lessonController.getLessonVideoUrl
);

module.exports = {
  lessonRouter: router,
  sectionScopedLessonRouter: sectionScopedRouter,
  questionRouter,
};
