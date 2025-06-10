// File: src/api/discussions/discussions.routes.js

const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const discussionValidation = require('./discussions.validation');
const discussionController = require('./discussions.controller');
const { authenticate } = require('../../middlewares/auth.middleware'); // Luôn cần đăng nhập

const router = express.Router();

// Áp dụng authenticate cho tất cả route discussions
router.use(authenticate);

// --- Routes thao tác trên Thread cụ thể ---
router
  .route('/threads/:threadId')
  .patch(
    // Update thread title
    validate(discussionValidation.updateThread),
    discussionController.updateThread
  )
  .delete(
    // Delete thread
    validate(discussionValidation.deleteThread),
    discussionController.deleteThread
  );

router.patch(
  '/threads/:threadId/status',
  validate(discussionValidation.updateThreadStatus),
  discussionController.updateThreadStatus
);

// --- Routes thao tác trên Post cụ thể ---
router
  .route('/posts/:postId')
  .patch(
    // Update post text
    validate(discussionValidation.updatePost),
    discussionController.updatePost
  )
  .delete(
    // Delete post
    validate(discussionValidation.deletePost),
    discussionController.deletePost
  );

// --- Routes lấy posts hoặc tạo post cho thread ---
router
  .route('/threads/:threadId/posts')
  .get(
    // Lấy danh sách posts của thread
    validate(discussionValidation.getPosts),
    discussionController.getPosts
  )
  .post(
    // Tạo post mới (reply)
    validate(discussionValidation.createPost),
    discussionController.createPost
  );

// --- Routers lồng vào course/lesson (sẽ được mount từ bên ngoài) ---
const courseScopedRouter = express.Router({ mergeParams: true });
courseScopedRouter.use(authenticate); // Đảm bảo authenticate ở đây nữa
courseScopedRouter
  .route('/')
  .post(
    // Tạo thread mới cho course
    validate(discussionValidation.createThread),
    discussionController.createThread
  )
  .get(
    // Lấy danh sách threads của course
    validate(discussionValidation.getThreads),
    discussionController.getThreads
  );

const lessonScopedRouter = express.Router({ mergeParams: true });
lessonScopedRouter.use(authenticate);
lessonScopedRouter
  .route('/')
  .post(
    // Tạo thread mới cho lesson
    validate(discussionValidation.createThread),
    discussionController.createThread
  )
  .get(
    // Lấy danh sách threads của lesson
    validate(discussionValidation.getThreads),
    discussionController.getThreads
  );

module.exports = {
  discussionRouter: router, // Router chính (/v1/discussions/...)
  courseDiscussionRouter: courseScopedRouter, // Router lồng (/v1/courses/:courseId/discussions)
  lessonDiscussionRouter: lessonScopedRouter, // Router lồng (/v1/lessons/:lessonId/discussions)
};
