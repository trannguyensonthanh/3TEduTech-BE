const express = require('express');
const validate = require('../../middlewares/validation.middleware');
const reviewValidation = require('./reviews.validation');
const reviewController = require('./reviews.controller');
const { authenticate } = require('../../middlewares/auth.middleware'); // Cần authenticate để biết ai đánh giá/xóa
// const passUserIfAuthenticated = require('../../middlewares/passUserIfAuthenticated'); // Dùng cho get list

// Router chính cho thao tác trên reviewId
const reviewRouter = express.Router();
reviewRouter.delete(
  '/:reviewId',
  authenticate, // Cần biết user để check quyền xóa
  validate(reviewValidation.deleteReview),
  reviewController.deleteReview
);

// Router lồng vào courseId
const courseScopedReviewRouter = express.Router({ mergeParams: true }); // mergeParams để lấy courseId

courseScopedReviewRouter.post(
  '/', // Tạo/Cập nhật đánh giá cho khóa học
  authenticate, // Phải đăng nhập để đánh giá
  (req, res, next) => {
    console.log('req.body', req.body);
    next();
  },
  validate(reviewValidation.createOrUpdateReview),
  reviewController.createOrUpdateReview
);

courseScopedReviewRouter.get(
  '/', // Lấy danh sách đánh giá của khóa học
  // passUserIfAuthenticated, // Có thể mở public
  validate(reviewValidation.getReviews),
  reviewController.getReviewsByCourse
);

courseScopedReviewRouter.get(
  '/my-review', // Lấy đánh giá của user hiện tại cho khóa học này
  authenticate,
  validate(reviewValidation.getMyReview),
  reviewController.getMyReviewForCourse
);

module.exports = {
  reviewRouter,
  courseScopedReviewRouter,
};
