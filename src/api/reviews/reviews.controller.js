const httpStatus = require('http-status').status;
const reviewService = require('./reviews.service');
const { catchAsync } = require('../../utils/catchAsync');
const { pick } = require('../../utils/pick');

/**
 * Create or update a review for a course
 */
const createOrUpdateReview = catchAsync(async (req, res) => {
  const { user } = req;
  const { courseId } = req.params;
  const review = await reviewService.createOrUpdateReview(
    user,
    courseId,
    req.body
  );
  res.status(httpStatus.OK).send(review);
});

/**
 * Get reviews by course
 */
const getReviewsByCourse = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'rating']);
  const result = await reviewService.getReviewsByCourse(courseId, options);
  res.status(httpStatus.OK).send(result);
});

/**
 * Get my review for a course
 */
const getMyReviewForCourse = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const { courseId } = req.params;
  const review = await reviewService.getMyReviewForCourse(accountId, courseId);
  if (!review) {
    return res.status(httpStatus.OK).send(null);
  }
  res.status(httpStatus.OK).send(review);
});

/**
 * Delete a review
 */
const deleteReview = catchAsync(async (req, res) => {
  const { reviewId } = req.params;
  await reviewService.deleteReview(reviewId, req.user);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Get course reviews by instructor
 */
const getCourseReviewsByInstructor = catchAsync(async (req, res) => {
  const { instructorId } = req.params;
  const filterOptions = pick(req.query, ['minRating', 'courseId']);
  const paginationOptions = pick(req.query, ['page', 'limit', 'sortBy']);
  const result = await reviewService.queryCourseReviewsByInstructor(
    instructorId,
    filterOptions,
    paginationOptions
  );
  res.status(httpStatus.OK).send(result);
});

module.exports = {
  createOrUpdateReview,
  getReviewsByCourse,
  getMyReviewForCourse,
  deleteReview,
  getCourseReviewsByInstructor,
};
