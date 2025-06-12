// File: src/api/courses/courses.controller.js

const httpStatus = require('http-status').status;
const courseService = require('./courses.service');
const { catchAsync } = require('../../utils/catchAsync');
const { pick } = require('../../utils/pick');
const ApiError = require('../../core/errors/ApiError');
const { toCamelCaseObject } = require('../../utils/caseConverter');

const createCourse = catchAsync(async (req, res) => {
  const course = await courseService.createCourse(req.body, req.user.id);
  res.status(httpStatus.CREATED).send(course);
});

const updateCourse = catchAsync(async (req, res) => {
  const course = await courseService.updateCourse(
    req.params.courseId,
    req.body,
    req.user
  );
  res.status(httpStatus.OK).send(course);
});

const deleteCourse = catchAsync(async (req, res) => {
  await courseService.deleteCourse(req.params.courseId, req.user);
  res.status(httpStatus.NO_CONTENT).send();
});

const submitCourseForApproval = catchAsync(async (req, res) => {
  const { notes } = req.body;
  const approvalRequest = await courseService.submitCourseForApproval(
    req.params.courseId,
    req.user,
    notes
  );
  res.status(httpStatus.OK).send({
    message: 'Yêu cầu duyệt khóa học đã được gửi.',
    request: approvalRequest,
  });
});

const getApprovalRequests = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'status',
    'instructorId',
    'courseId',
    'searchTerm',
  ]);
  const options = pick(req.query, ['limit', 'page', 'sortBy']);
  const result = await courseService.getApprovalRequests(filters, options);
  res.status(httpStatus.OK).send(result);
});

const getApprovalRequestDetails = catchAsync(async (req, res) => {
  const requestDetails = await courseService.getApprovalRequestDetails(
    req.params.requestId
  );
  res.status(httpStatus.OK).send(requestDetails);
});

// --- Admin Actions ---
const reviewCourseApproval = catchAsync(async (req, res) => {
  const { decision, adminNotes } = req.body;
  const updatedRequest = await courseService.reviewCourseApproval(
    req.params.requestId,
    decision,
    req.user,
    adminNotes
  );
  res.status(httpStatus.OK).send({
    message: 'Đã xử lý yêu cầu duyệt.',
    request: toCamelCaseObject(updatedRequest),
  });
});

const toggleCourseFeature = catchAsync(async (req, res) => {
  const { isFeatured } = req.body;
  const course = await courseService.toggleCourseFeature(
    req.params.courseId,
    isFeatured,
    req.user
  );
  res.status(httpStatus.OK).send(course);
});

// --- Public/User Actions ---
const getCourses = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'searchTerm',
    'categoryId',
    'levelId',
    'instructorId',
    'statusId',
    'isFeatured',
    'language',
    'userPage',
  ]);
  const options = pick(req.query, ['limit', 'page', 'sortBy']);

  // Nếu userPage không có giá trị, mặc định là false
  if (filters.userPage === undefined) {
    filters.userPage = false;
  }

  // Truyền req.user để service xử lý quyền xem
  const result = await courseService.getCourses(
    filters,
    options,
    req.user,
    req.targetCurrency
  );

  res.status(httpStatus.OK).send(result);
});

const getCourse = catchAsync(async (req, res) => {
  // Truyền req.user để service xử lý quyền xem
  const course = await courseService.getCourseBySlug(
    req.params.slug,
    req.user,
    req.targetCurrency
  );
  res.status(httpStatus.OK).send(course);
});

// --- Thêm Controller cho Upload Thumbnail ---
const updateCourseThumbnail = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Vui lòng cung cấp file thumbnail.'
    );
  }
  const course = await courseService.updateCourseThumbnail(
    req.params.courseId,
    req.file,
    req.user
  );
  res.status(httpStatus.OK).send(course);
});

const updateCourseIntroVideo = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Vui lòng cung cấp file video giới thiệu.'
    );
  }
  const course = await courseService.updateCourseIntroVideo(
    req.params.courseId,
    req.file,
    req.user
  );
  res.status(httpStatus.OK).send(course);
});

const getCourseStatuses = catchAsync(async (req, res) => {
  const statuses = await courseService.getCourseStatuses();
  res.status(httpStatus.OK).send(statuses);
});

const getCoursesByCategorySlug = catchAsync(async (req, res) => {
  const { categorySlug } = req.params;
  const filterOptions = pick(req.query, [
    'levelId',
    'language',
    'minPrice',
    'maxPrice',
    'searchTerm',
  ]);
  const paginationOptions = pick(req.query, ['page', 'limit', 'sortBy']);

  const result = await courseService.queryCoursesByCategorySlug(
    categorySlug,
    filterOptions,
    paginationOptions,
    req.targetCurrency
  );
  res.status(httpStatus.OK).send(result);
});

const getCoursesByInstructorId = catchAsync(async (req, res) => {
  const { instructorId } = req.params;

  const filterOptions = pick(req.query, ['searchTerm', 'statusId']);
  const paginationOptions = pick(req.query, ['page', 'limit', 'sortBy']);

  const result = await courseService.queryCoursesByInstructor(
    instructorId,
    filterOptions,
    paginationOptions,
    req.user,
    req.targetCurrency
  );
  res.status(httpStatus.OK).send(result);
});

module.exports = {
  createCourse,
  updateCourse,
  deleteCourse,
  submitCourseForApproval,
  getApprovalRequests,
  getApprovalRequestDetails,

  reviewCourseApproval,
  toggleCourseFeature,

  getCourses,
  getCourse,
  updateCourseThumbnail,
  updateCourseIntroVideo,
  getCourseStatuses,
  getCoursesByCategorySlug,
  getCoursesByInstructorId,
};
