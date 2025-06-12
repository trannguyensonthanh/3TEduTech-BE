// File: src/api/discussions/discussions.routes.js

const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const discussionValidation = require('./discussions.validation');
const discussionController = require('./discussions.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Tất cả các route trong file này đều yêu cầu xác thực người dùng (đã đăng nhập).
router.use(authenticate);

// --- Quản lý một thread cụ thể ---
router
  .route('/threads/:threadId')
  // Cập nhật thông tin thread (ví dụ: tiêu đề)
  .patch(
    validate(discussionValidation.updateThread),
    discussionController.updateThread
  )
  // Xóa một thread
  .delete(
    validate(discussionValidation.deleteThread),
    discussionController.deleteThread
  );

// --- Cập nhật trạng thái đóng/mở của một thread ---
router.patch(
  '/threads/:threadId/status',
  validate(discussionValidation.updateThreadStatus),
  discussionController.updateThreadStatus
);

// --- Quản lý một bài viết (post) cụ thể ---
router
  .route('/posts/:postId')
  // Cập nhật nội dung một bài viết
  .patch(
    validate(discussionValidation.updatePost),
    discussionController.updatePost
  )
  // Xóa một bài viết
  .delete(
    validate(discussionValidation.deletePost),
    discussionController.deletePost
  );

// --- Quản lý các bài viết (posts) trong một thread ---
router
  .route('/threads/:threadId/posts')
  // Lấy danh sách các bài viết của một thread
  .get(validate(discussionValidation.getPosts), discussionController.getPosts)
  // Tạo một bài viết mới trong thread
  .post(
    validate(discussionValidation.createPost),
    discussionController.createPost
  );

// --- Router cho các thảo luận trong phạm vi một KHÓA HỌC ---
// (Dùng để gắn vào /api/courses/:courseId/discussions)
const courseScopedRouter = express.Router({ mergeParams: true });
courseScopedRouter.use(authenticate);
courseScopedRouter
  .route('/')
  // Tạo thread mới trong khóa học
  .post(
    validate(discussionValidation.createThread),
    discussionController.createThread
  )
  // Lấy danh sách các thread trong khóa học
  .get(
    validate(discussionValidation.getThreads),
    discussionController.getThreads
  );

// --- Router cho các thảo luận trong phạm vi một BÀI HỌC ---
// (Dùng để gắn vào /api/lessons/:lessonId/discussions)
const lessonScopedRouter = express.Router({ mergeParams: true });
lessonScopedRouter.use(authenticate);
lessonScopedRouter
  .route('/')
  // Tạo thread mới trong bài học
  .post(
    validate(discussionValidation.createThread),
    discussionController.createThread
  )
  // Lấy danh sách các thread trong bài học
  .get(
    validate(discussionValidation.getThreads),
    discussionController.getThreads
  );

// Xuất các router đã định nghĩa để sử dụng ở file route chính
module.exports = {
  discussionRouter: router,
  courseDiscussionRouter: courseScopedRouter,
  lessonDiscussionRouter: lessonScopedRouter,
};
