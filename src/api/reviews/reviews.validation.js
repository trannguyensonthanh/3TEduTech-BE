const Joi = require('joi');
Joi.objectId = require('joi-objectid')(Joi);

// Validate create or update review
const createOrUpdateReview = {
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    rating: Joi.number().integer().min(1).max(5).required(),
    comment: Joi.string().allow(null, '').max(4000),
  }),
};

// Validate get reviews
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
    rating: Joi.number().integer().min(1).max(5),
  }),
};

// Validate get my review
const getMyReview = {
  params: Joi.object().keys({
    courseId: Joi.number().integer().required(),
  }),
};

// Validate delete review
const deleteReview = {
  params: Joi.object().keys({
    reviewId: Joi.number().integer().required(),
  }),
};

// Validate get reviews by instructor
const getReviewsByInstructor = {
  params: Joi.object().keys({
    instructorId: Joi.alternatives()
      .try(Joi.number().integer(), Joi.objectId())
      .required(),
  }),
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1),
    sortBy: Joi.string().valid('reviewedAt:desc', 'rating:desc', 'rating:asc'),
    minRating: Joi.number().integer().min(1).max(5),
  }),
};

module.exports = {
  createOrUpdateReview,
  getReviews,
  getMyReview,
  deleteReview,
  getReviewsByInstructor,
};
