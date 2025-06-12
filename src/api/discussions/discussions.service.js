// File: src/api/discussions/discussions.service.js

const httpStatus = require('http-status').status;
const discussionRepository = require('./discussions.repository');
const courseRepository = require('../courses/courses.repository');
const lessonRepository = require('../lessons/lessons.repository');
const enrollmentService = require('../enrollments/enrollments.service');
const ApiError = require('../../core/errors/ApiError');
const Roles = require('../../core/enums/Roles');
const logger = require('../../utils/logger');
const notificationService = require('../notifications/notifications.service');
const { toCamelCaseObject } = require('../../utils/caseConverter');

/**
 * Helper function to check if user can access/participate in discussions for a course.
 * Requires enrollment, or being the instructor, or an admin.
 * @param {number} courseId
 * @param {object} user
 * @param {string} actionDescription
 * @returns {Promise<{isEnrolled: boolean, isInstructor: boolean, isAdmin: boolean, course: object}>}
 */
const checkDiscussionAccess = async (
  courseId,
  user,
  actionDescription = 'truy cập thảo luận'
) => {
  if (!user) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      `Bạn cần đăng nhập để ${actionDescription}.`
    );
  }
  const course = await courseRepository.findCourseById(courseId, true);
  if (!course) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy khóa học.');
  }

  const isInstructor =
    user.role === Roles.INSTRUCTOR && course.InstructorID === user.id;
  const isAdmin = user.role === Roles.ADMIN || user.role === Roles.SUPERADMIN;
  let isEnrolled = false;
  if (!isInstructor && !isAdmin) {
    isEnrolled = await enrollmentService.isUserEnrolled(user.id, courseId);
  }

  if (!isEnrolled && !isInstructor && !isAdmin) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      `Bạn cần đăng ký khóa học để ${actionDescription}.`
    );
  }

  return { isEnrolled, isInstructor, isAdmin, course };
};

/**
 * Tạo thread mới.
 * @param {object} threadData - { courseId, lessonId (optional), title }
 * @param {object} user
 * @returns {Promise<object>}
 */
const createThread = async (threadData, user) => {
  const { courseId, lessonId, title } = threadData;
  const { course } = await checkDiscussionAccess(
    courseId,
    user,
    'tạo chủ đề thảo luận'
  );

  if (lessonId) {
    const lesson = await lessonRepository.findLessonById(lessonId);

    if (!lesson || Number(lesson.CourseID) !== courseId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Bài học không thuộc khóa học này.'
      );
    }
  }

  const newThreadData = {
    CourseID: courseId,
    LessonID: lessonId,
    Title: title,
    CreatedByAccountID: user.id,
  };
  const newThread = await discussionRepository.createThread(newThreadData);
  const thread = await discussionRepository.findThreadById(newThread.ThreadID);
  return toCamelCaseObject(thread);
};

/**
 * Lấy danh sách threads cho course hoặc lesson.
 * @param {object} filters - { courseId, lessonId }
 * @param {object} options
 * @param {object} user
 * @returns {Promise<object>}
 */
const getThreads = async (filters, options, user) => {
  const courseId =
    filters.courseId ||
    (filters.lessonId
      ? (await lessonRepository.findLessonById(filters.lessonId))?.CourseID
      : null);
  if (!courseId)
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Cần cung cấp courseId hoặc lessonId hợp lệ.'
    );

  await checkDiscussionAccess(courseId, user, 'xem thảo luận');

  const { page = 1, limit = 10 } = options;
  const result = await discussionRepository.findThreads(filters, options);

  return {
    threads: toCamelCaseObject(result.threads),
    total: result.total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalPages: Math.ceil(result.total / limit),
  };
};

/**
 * Cập nhật tiêu đề thread (chỉ người tạo hoặc instructor/admin).
 * @param {number} threadId
 * @param {string} title
 * @param {object} user
 * @returns {Promise<object>}
 */
const updateThread = async (threadId, title, user) => {
  const thread = await discussionRepository.findThreadById(threadId);
  if (!thread)
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy chủ đề.');

  const { isInstructor, isAdmin } = await checkDiscussionAccess(
    thread.CourseID,
    user,
    'cập nhật chủ đề'
  );
  const isOwner = thread.CreatedByAccountID === user.id;

  if (!isOwner && !isInstructor && !isAdmin) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn không có quyền cập nhật chủ đề này.'
    );
  }

  return discussionRepository.updateThreadTitle(threadId, title);
};

/**
 * Xóa thread (chỉ người tạo hoặc instructor/admin).
 * @param {number} threadId
 * @param {object} user
 * @returns {Promise<void>}
 */
const deleteThread = async (threadId, user) => {
  const thread = await discussionRepository.findThreadById(threadId);
  if (!thread)
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy chủ đề.');

  const { isInstructor, isAdmin } = await checkDiscussionAccess(
    thread.CourseID,
    user,
    'xóa chủ đề'
  );
  const isOwner = thread.CreatedByAccountID === user.id;

  if (!isOwner && !isInstructor && !isAdmin) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn không có quyền xóa chủ đề này.'
    );
  }
  await discussionRepository.deleteThreadById(threadId);
  logger.info(`Discussion thread ${threadId} deleted by user ${user.id}`);
};

/**
 * Tạo post mới (reply).
 * @param {number} threadId
 * @param {object} postData -
 * @param {object} user
 * @returns {Promise<object>}
 */
const createPost = async (threadId, postData, user) => {
  const { text, parentPostId } = postData;
  const thread = await discussionRepository.findThreadById(threadId);
  if (!thread)
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Không tìm thấy chủ đề thảo luận.'
    );

  const { isInstructor, course } = await checkDiscussionAccess(
    thread.CourseID,
    user,
    'tham gia thảo luận'
  );

  if (parentPostId) {
    const parentPost = await discussionRepository.findPostById(parentPostId);
    if (!parentPost || Number(parentPost.ThreadID) !== threadId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Bài viết trả lời không hợp lệ.'
      );
    }
  }

  const newPostData = {
    ThreadID: threadId,
    ParentPostID: parentPostId,
    AccountID: user.id,
    PostText: text,
    IsInstructorPost:
      user.role === Roles.INSTRUCTOR && course.InstructorID === user.id,
  };

  const newPost = await discussionRepository.createPost(newPostData);

  if (thread && thread.CreatedByAccountID !== user.id) {
    try {
      const message = `${
        user.displayName || 'Ai đó'
      } đã trả lời trong chủ đề "${thread.Title}" của bạn.`;
      await notificationService.createNotification(
        thread.CreatedByAccountID,
        'NEW_DISCUSSION_REPLY',
        message,
        { type: 'DiscussionThread', id: threadId }
      );
    } catch (notifyError) {
      logger.error(
        `Failed to send reply notification for thread ${threadId}:`,
        notifyError
      );
    }
  }

  return discussionRepository.findPostById(newPost.PostID);
};

/**
 * Lấy danh sách các post của một thread.
 * @param {number} threadId
 * @param {object} options
 * @param {object} user
 * @returns {Promise<object>}
 */
const getPostsByThread = async (threadId, options, user) => {
  const thread = await discussionRepository.findThreadById(threadId);
  if (!thread)
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Không tìm thấy chủ đề thảo luận.'
    );

  await checkDiscussionAccess(thread.CourseID, user, 'xem thảo luận');

  const { page = 1, limit = 20 } = options;
  const result = await discussionRepository.findPostsByThreadId(
    threadId,
    options
  );

  return {
    posts: toCamelCaseObject(result.posts),
    total: result.total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalPages: Math.ceil(result.total / limit),
  };
};

/**
 * Cập nhật nội dung post (chỉ người tạo hoặc instructor/admin).
 * @param {number} postId
 * @param {string} text
 * @param {object} user
 * @returns {Promise<object>}
 */
const updatePost = async (postId, text, user) => {
  const post = await discussionRepository.findPostById(postId);
  if (!post)
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy bài viết.');

  const { isInstructor, isAdmin } = await checkDiscussionAccess(
    post.CourseID,
    user,
    'cập nhật bài viết'
  );
  const isOwner = post.AccountID === user.id;

  if (!isOwner && !isInstructor && !isAdmin) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn không có quyền cập nhật bài viết này.'
    );
  }

  const updatedPost = await discussionRepository.updatePostById(postId, text);

  return discussionRepository.findPostById(updatedPost.PostID);
};

/**
 * Xóa post (chỉ người tạo hoặc instructor/admin).
 * @param {number} postId
 * @param {object} user
 * @returns {Promise<void>}
 */
const deletePost = async (postId, user) => {
  const post = await discussionRepository.findPostById(postId);
  if (!post)
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy bài viết.');

  const { isInstructor, isAdmin } = await checkDiscussionAccess(
    post.CourseID,
    user,
    'xóa bài viết'
  );
  const isOwner = post.AccountID === user.id;

  if (!isOwner && !isInstructor && !isAdmin) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn không có quyền xóa bài viết này.'
    );
  }

  await discussionRepository.deletePostById(postId);
  logger.info(`Discussion post ${postId} deleted by user ${user.id}`);
};

/**
 * Giảng viên/Admin đóng hoặc mở một thread.
 * @param {number} threadId
 * @param {boolean} isClosed
 * @param {object} user
 * @returns {Promise<object>}
 */
const closeOrOpenThread = async (threadId, isClosed, user) => {
  const thread = await discussionRepository.findThreadById(threadId);
  if (!thread) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Không tìm thấy chủ đề thảo luận.'
    );
  }

  const isAdmin = user.role === Roles.ADMIN || user.role === Roles.SUPERADMIN;
  const isCourseInstructor =
    user.role === Roles.INSTRUCTOR && thread.CourseInstructorID === user.id;

  if (!isCourseInstructor && !isAdmin) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn không có quyền thay đổi trạng thái chủ đề này.'
    );
  }

  const updatedThread = await discussionRepository.updateThreadClosedStatus(
    threadId,
    isClosed
  );
  if (!updatedThread) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Cập nhật trạng thái chủ đề thất bại.'
    );
  }

  logger.info(
    `Thread ${threadId} status changed to IsClosed=${isClosed} by user ${user.id}`
  );

  return discussionRepository.findThreadById(threadId);
};

module.exports = {
  createThread,
  getThreads,
  updateThread,
  deleteThread,
  createPost,
  getPostsByThread,
  updatePost,
  deletePost,
  closeOrOpenThread,
};
