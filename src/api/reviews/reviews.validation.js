const Joi = require('joi');
Joi.objectId = require('joi-objectid')(Joi);

const createOrUpdateReview = {
  params: Joi.object().keys({
    // courseId lấy từ route lồng nhau
    courseId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    rating: Joi.number().integer().min(1).max(5).required(),
    comment: Joi.string().allow(null, '').max(4000), // Giới hạn độ dài comment
  }),
};

const getReviews = {
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(50),
    sortBy: Joi.string().valid(
      'ReviewedAt:desc',
      'ReviewedAt:asc',
      'Rating:desc',
      'Rating:asc'
    ),
    rating: Joi.number().integer().min(1).max(5), // Lọc theo số sao
  }),
};

const getMyReview = {
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
};

const deleteReview = {
  params: Joi.object().keys({
    reviewId: Joi.number().integer().required(),
  }),
};

const getReviewsByInstructor = {
  params: Joi.object().keys({
    instructorId: Joi.alternatives()
      .try(Joi.number().integer(), Joi.objectId()) // dùng Joi.objectId() chứ không phải objectId()
      .required(),
  }),
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1),
    sortBy: Joi.string().valid('reviewedAt:desc', 'rating:desc', 'rating:asc'),
    minRating: Joi.number().integer().min(1).max(5),
    // courseId: Joi.number().integer(), // optional
  }),
};

module.exports = {
  createOrUpdateReview,
  getReviews,
  getMyReview,
  deleteReview,
  getReviewsByInstructor,
};
