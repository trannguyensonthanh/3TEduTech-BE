const httpStatus = require('http-status').status;
const reviewService = require('./reviews.service');
const { catchAsync } = require('../../utils/catchAsync');
const { pick } = require('../../utils/pick');

const createOrUpdateReview = catchAsync(async (req, res) => {
  const accountId = req.user.id; // Lấy từ authenticate middleware
  const { courseId } = req.params; // Lấy từ route lồng nhau
  const review = await reviewService.createOrUpdateReview(
    accountId,
    courseId,
    req.body
  );
  res.status(httpStatus.OK).send(review); // Trả về OK vì có thể là create hoặc update
});

const getReviewsByCourse = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'rating']);
  const result = await reviewService.getReviewsByCourse(courseId, options);
  res.status(httpStatus.OK).send(result);
});

const getMyReviewForCourse = catchAsync(async (req, res) => {
  const accountId = req.user.id;
  const { courseId } = req.params;
  const review = await reviewService.getMyReviewForCourse(accountId, courseId);
  if (!review) {
    // Trả về 204 hoặc 404 nếu chưa có review? Tạm thời 200 với body null
    return res.status(httpStatus.OK).send(null);
  }
  res.status(httpStatus.OK).send(review);
});

const deleteReview = catchAsync(async (req, res) => {
  const { reviewId } = req.params;
  await reviewService.deleteReview(reviewId, req.user);
  res.status(httpStatus.NO_CONTENT).send();
});

const getCourseReviewsByInstructor = catchAsync(async (req, res) => {
  const { instructorId } = req.params;
  const filterOptions = pick(req.query, ['minRating', 'courseId']); // Lấy các filter từ query
  const paginationOptions = pick(req.query, ['page', 'limit', 'sortBy']);

  // Có thể truyền req.user vào service nếu cần kiểm tra quyền chi tiết
  const result = await reviewService.queryCourseReviewsByInstructor(
    instructorId,
    filterOptions,
    paginationOptions
    // req.user
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
