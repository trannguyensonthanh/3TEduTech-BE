const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const reviewValidation = require('./reviews.validation');
const reviewController = require('./reviews.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

// Router chính cho thao tác trên reviewId
const reviewRouter = express.Router();
reviewRouter.delete(
  '/:reviewId',
  authenticate,
  validate(reviewValidation.deleteReview),
  reviewController.deleteReview
);

// Router lồng vào courseId
const courseScopedReviewRouter = express.Router({ mergeParams: true });

/**
 * Tạo/Cập nhật đánh giá cho khóa học
 */
courseScopedReviewRouter.post(
  '/',
  authenticate,
  (req, res, next) => {
    console.log('req.body', req.body);
    next();
  },
  validate(reviewValidation.createOrUpdateReview),
  reviewController.createOrUpdateReview
);

/**
 * Lấy danh sách đánh giá của khóa học
 */
courseScopedReviewRouter.get(
  '/',
  validate(reviewValidation.getReviews),
  reviewController.getReviewsByCourse
);

/**
 * Lấy đánh giá của user hiện tại cho khóa học này
 */
courseScopedReviewRouter.get(
  '/my-review',
  authenticate,
  validate(reviewValidation.getMyReview),
  reviewController.getMyReviewForCourse
);

module.exports = {
  reviewRouter,
  courseScopedReviewRouter,
};
