// File: src/api/discussions/discussions.controller.js

const httpStatus = require('http-status').status;
const discussionService = require('./discussions.service');
const { catchAsync } = require('../../utils/catchAsync');
const { pick } = require('../../utils/pick');

/**
 * Create a new discussion thread
 */
const createThread = catchAsync(async (req, res) => {
  const thread = await discussionService.createThread(req.body, req.user);
  res.status(httpStatus.CREATED).send(thread);
});

/**
 * Get discussion threads with filters and options
 */
const getThreads = catchAsync(async (req, res) => {
  const filters = pick(req.params, ['courseId', 'lessonId']);
  const options = pick(req.query, ['limit', 'page', 'sortBy']);
  const result = await discussionService.getThreads(filters, options, req.user);
  res.status(httpStatus.OK).send(result);
});

/**
 * Update a discussion thread's title
 */
const updateThread = catchAsync(async (req, res) => {
  const thread = await discussionService.updateThread(
    req.params.threadId,
    req.body.title,
    req.user
  );
  res.status(httpStatus.OK).send(thread);
});

/**
 * Delete a discussion thread
 */
const deleteThread = catchAsync(async (req, res) => {
  await discussionService.deleteThread(req.params.threadId, req.user);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Create a new post in a thread
 */
const createPost = catchAsync(async (req, res) => {
  const post = await discussionService.createPost(
    req.params.threadId,
    req.body,
    req.user
  );
  res.status(httpStatus.CREATED).send(post);
});

/**
 * Get posts by thread with options
 */
const getPosts = catchAsync(async (req, res) => {
  const options = pick(req.query, ['limit', 'page']);
  const result = await discussionService.getPostsByThread(
    req.params.threadId,
    options,
    req.user
  );
  res.status(httpStatus.OK).send(result);
});

/**
 * Update a post's text
 */
const updatePost = catchAsync(async (req, res) => {
  const post = await discussionService.updatePost(
    req.params.postId,
    req.body.text,
    req.user
  );
  res.status(httpStatus.OK).send(post);
});

/**
 * Delete a post
 */
const deletePost = catchAsync(async (req, res) => {
  await discussionService.deletePost(req.params.postId, req.user);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Update thread status (close or open)
 */
const updateThreadStatus = catchAsync(async (req, res) => {
  const { isClosed } = req.body;
  const thread = await discussionService.closeOrOpenThread(
    req.params.threadId,
    isClosed,
    req.user
  );
  res.status(httpStatus.OK).send(thread);
});

module.exports = {
  createThread,
  getThreads,
  updateThread,
  deleteThread,

  createPost,
  getPosts,
  updatePost,
  deletePost,
  updateThreadStatus,
};
