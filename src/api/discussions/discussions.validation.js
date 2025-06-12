// File: src/api/discussions/discussions.validation.js

const Joi = require('joi');

/**
 * Validate create thread request
 */
const createThread = {
  body: Joi.object().keys({
    courseId: Joi.number().integer().required(),
    title: Joi.string().required().max(500),
    lessonId: Joi.number().integer().optional().allow(null),
  }),
};

/**
 * Validate get threads request
 */
const getThreads = {
  params: Joi.object()
    .keys({
      courseId: Joi.number().integer(),
      lessonId: Joi.number().integer(),
    })
    .xor('courseId', 'lessonId'),
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(50),
    sortBy: Joi.string().valid(
      'CreatedAt:desc',
      'CreatedAt:asc',
      'UpdatedAt:desc'
    ),
  }),
};

/**
 * Validate update thread request
 */
const updateThread = {
  params: Joi.object().keys({
    threadId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    title: Joi.string().required().max(500),
  }),
};

/**
 * Validate delete thread request
 */
const deleteThread = {
  params: Joi.object().keys({
    threadId: Joi.number().integer().required(),
  }),
};

/**
 * Validate create post request
 */
const createPost = {
  params: Joi.object().keys({
    threadId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    text: Joi.string().required().min(1).max(10000),
    parentPostId: Joi.number().integer().optional().allow(null),
  }),
};

/**
 * Validate get posts request
 */
const getPosts = {
  params: Joi.object().keys({
    threadId: Joi.number().integer().required(),
  }),
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
  }),
};

/**
 * Validate update post request
 */
const updatePost = {
  params: Joi.object().keys({
    postId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    text: Joi.string().required().min(1).max(10000),
  }),
};

/**
 * Validate delete post request
 */
const deletePost = {
  params: Joi.object().keys({
    postId: Joi.number().integer().required(),
  }),
};

/**
 * Validate update thread status request
 */
const updateThreadStatus = {
  params: Joi.object().keys({
    threadId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    isClosed: Joi.boolean().required(),
  }),
};

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
