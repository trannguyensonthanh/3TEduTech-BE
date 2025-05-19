// File: src/api/discussions/discussions.controller.js

const httpStatus = require('http-status').status;
const discussionService = require('./discussions.service');
const { catchAsync } = require('../../utils/catchAsync');
const { pick } = require('../../utils/pick');

// === Thread Controllers ===
const createThread = catchAsync(async (req, res) => {
  const thread = await discussionService.createThread(req.body, req.user);
  res.status(httpStatus.CREATED).send(thread);
});

const getThreads = catchAsync(async (req, res) => {
  const filters = pick(req.params, ['courseId', 'lessonId']); // Lấy filter từ params
  const options = pick(req.query, ['limit', 'page', 'sortBy']);
  const result = await discussionService.getThreads(filters, options, req.user);
  res.status(httpStatus.OK).send(result);
});

const updateThread = catchAsync(async (req, res) => {
  const thread = await discussionService.updateThread(
    req.params.threadId,
    req.body.title,
    req.user
  );
  res.status(httpStatus.OK).send(thread);
});

const deleteThread = catchAsync(async (req, res) => {
  await discussionService.deleteThread(req.params.threadId, req.user);
  res.status(httpStatus.NO_CONTENT).send();
});

// === Post Controllers ===
const createPost = catchAsync(async (req, res) => {
  const post = await discussionService.createPost(
    req.params.threadId,
    req.body,
    req.user
  );
  res.status(httpStatus.CREATED).send(post);
});

const getPosts = catchAsync(async (req, res) => {
  const options = pick(req.query, ['limit', 'page']);
  const result = await discussionService.getPostsByThread(
    req.params.threadId,
    options,
    req.user
  );
  res.status(httpStatus.OK).send(result);
});

const updatePost = catchAsync(async (req, res) => {
  const post = await discussionService.updatePost(
    req.params.postId,
    req.body.text,
    req.user
  );
  res.status(httpStatus.OK).send(post);
});

const deletePost = catchAsync(async (req, res) => {
  await discussionService.deletePost(req.params.postId, req.user);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  // Threads
  createThread,
  getThreads,
  updateThread,
  deleteThread,
  // Posts
  createPost,
  getPosts,
  updatePost,
  deletePost,
};
