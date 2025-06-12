// File: src/api/discussions/discussions.validation.js

const Joi = require('joi');

const createThread = {
  body: Joi.object().keys({
    courseId: Joi.number().integer().required(),
    title: Joi.string().required().max(500),
    lessonId: Joi.number().integer().optional().allow(null),
  }),
};

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

const updateThread = {
  params: Joi.object().keys({
    threadId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    title: Joi.string().required().max(500),
  }),
};

const deleteThread = {
  params: Joi.object().keys({
    threadId: Joi.number().integer().required(),
  }),
};

const createPost = {
  params: Joi.object().keys({
    threadId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    text: Joi.string().required().min(1).max(10000),
    parentPostId: Joi.number().integer().optional().allow(null),
  }),
};

const getPosts = {
  params: Joi.object().keys({
    threadId: Joi.number().integer().required(),
  }),
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
  }),
};

const updatePost = {
  params: Joi.object().keys({
    postId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    text: Joi.string().required().min(1).max(10000),
  }),
};

const deletePost = {
  params: Joi.object().keys({
    postId: Joi.number().integer().required(),
  }),
};

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
