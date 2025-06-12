// File: src/api/discussions/discussions.routes.js

const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const discussionValidation = require('./discussions.validation');
const discussionController = require('./discussions.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

const router = express.Router();

/**
 * Tất cả các route trong file này đều yêu cầu xác thực người dùng (đã đăng nhập).
 */
router.use(authenticate);

/**
 * Quản lý một thread cụ thể
 */
router
  .route('/threads/:threadId')
  .patch(
    validate(discussionValidation.updateThread),
    discussionController.updateThread
  )
  .delete(
    validate(discussionValidation.deleteThread),
    discussionController.deleteThread
  );

/**
 * Cập nhật trạng thái đóng/mở của một thread
 */
router.patch(
  '/threads/:threadId/status',
  validate(discussionValidation.updateThreadStatus),
  discussionController.updateThreadStatus
);

/**
 * Quản lý một bài viết (post) cụ thể
 */
router
  .route('/posts/:postId')
  .patch(
    validate(discussionValidation.updatePost),
    discussionController.updatePost
  )
  .delete(
    validate(discussionValidation.deletePost),
    discussionController.deletePost
  );

/**
 * Quản lý các bài viết (posts) trong một thread
 */
router
  .route('/threads/:threadId/posts')
  .get(validate(discussionValidation.getPosts), discussionController.getPosts)
  .post(
    validate(discussionValidation.createPost),
    discussionController.createPost
  );

/**
 * Router cho các thảo luận trong phạm vi một KHÓA HỌC
 * (Dùng để gắn vào /api/courses/:courseId/discussions)
 */
const courseScopedRouter = express.Router({ mergeParams: true });
courseScopedRouter.use(authenticate);
courseScopedRouter
  .route('/')
  .post(
    validate(discussionValidation.createThread),
    discussionController.createThread
  )
  .get(
    validate(discussionValidation.getThreads),
    discussionController.getThreads
  );

/**
 * Router cho các thảo luận trong phạm vi một BÀI HỌC
 * (Dùng để gắn vào /api/lessons/:lessonId/discussions)
 */
const lessonScopedRouter = express.Router({ mergeParams: true });
lessonScopedRouter.use(authenticate);
lessonScopedRouter
  .route('/')
  .post(
    validate(discussionValidation.createThread),
    discussionController.createThread
  )
  .get(
    validate(discussionValidation.getThreads),
    discussionController.getThreads
  );

/**
 * Xuất các router đã định nghĩa để sử dụng ở file route chính
 */
module.exports = {
  discussionRouter: router,
  courseDiscussionRouter: courseScopedRouter,
  lessonDiscussionRouter: lessonScopedRouter,
};
