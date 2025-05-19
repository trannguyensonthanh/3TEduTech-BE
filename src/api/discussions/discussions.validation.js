// File: src/api/discussions/discussions.validation.js

const Joi = require('joi');

// Validation cho Thread
const createThread = {
  // courseId hoặc lessonId sẽ lấy từ params của route cha
  body: Joi.object().keys({
    courseId: Joi.number().integer().required(), // Không cần nữa vì đã lấy từ params
    title: Joi.string().required().max(500),
    lessonId: Joi.number().integer().optional().allow(null), // Cho phép tạo thread chung cho course
  }),
};

const getThreads = {
  params: Joi.object()
    .keys({
      courseId: Joi.number().integer(),
      lessonId: Joi.number().integer(),
    })
    .xor('courseId', 'lessonId'), // Phải có 1 trong 2, không có cả 2
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(50),
    sortBy: Joi.string().valid(
      'CreatedAt:desc',
      'CreatedAt:asc',
      'UpdatedAt:desc'
    ), // Thêm UpdatedAt
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

// Validation cho Post
const createPost = {
  params: Joi.object().keys({
    threadId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    text: Joi.string().required().min(1).max(10000), // Giới hạn độ dài post
    parentPostId: Joi.number().integer().optional().allow(null),
  }),
};

const getPosts = {
  params: Joi.object().keys({
    threadId: Joi.number().integer().required(),
  }),
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100), // Lấy nhiều post hơn
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

module.exports = {
  createThread,
  getThreads,
  updateThread,
  deleteThread,
  createPost,
  getPosts,
  updatePost,
  deletePost,
};
