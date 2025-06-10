// File: src/api/courses/courses.controller.js

const httpStatus = require('http-status').status;
const courseService = require('./courses.service');
const { catchAsync } = require('../../utils/catchAsync');
const { pick } = require('../../utils/pick');
const ApiError = require('../../core/errors/ApiError');
const { toCamelCaseObject } = require('../../utils/caseConverter');
// --- Instructor/Admin Actions ---
const createCourse = catchAsync(async (req, res) => {
  // req.user.id được gắn bởi middleware authenticate
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
  // Cần lấy requestId từ params thay vì courseId
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

// const getPendingCourses = catchAsync(async (req, res) => {
//   const options = pick(req.query, ['limit', 'page', 'sortBy']);
//   const result = await courseService.getPendingCourses(options);
//   res.status(httpStatus.OK).send(result);
// });

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

// --- Controller mới cho Sync Curriculum ---
const syncCurriculum = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const { sections } = req.body; // Payload từ frontend

  // Gọi service để thực hiện đồng bộ
  const result = await courseService.syncCurriculum(
    parseInt(courseId, 10),
    sections,
    req.user // Truyền user để kiểm tra quyền
  );

  // Trả về curriculum đã cập nhật hoặc chỉ thông báo thành công
  res.status(httpStatus.OK).send({
    message: 'Curriculum synchronized successfully.',
    // updatedCurriculum: result.updatedCurriculum, // Tùy chọn trả về data mới
  });
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
    paginationOptions
  );
  res.status(httpStatus.OK).send(result);
});

const getCoursesByInstructorId = catchAsync(async (req, res) => {
  const { instructorId } = req.params;
  // Mặc định chỉ lấy các khóa học đã PUBLISHED của giảng viên này khi người khác xem
  // Nếu là chính giảng viên đó xem (hoặc admin), có thể cho phép xem các trạng thái khác
  // Điều này có thể xử lý ở service dựa trên req.user (nếu có) và instructorId
  const filterOptions = pick(req.query, ['searchTerm', 'statusId']);
  const paginationOptions = pick(req.query, ['page', 'limit', 'sortBy']);

  // Nếu không có statusId trong query, và người gọi không phải là instructor đó hoặc admin,
  // thì mặc định chỉ lấy PUBLISHED. Logic này nên ở service.
  // Ví dụ: if (!filterOptions.statusId && (!req.user || req.user.accountId !== parseInt(instructorId))) {
  //   filterOptions.statusId = CourseStatus.PUBLISHED;
  // }

  const result = await courseService.queryCoursesByInstructor(
    instructorId,
    filterOptions,
    paginationOptions,
    req.user // Truyền user để service có thể quyết định quyền xem các trạng thái
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
  // getPendingCourses,
  // Admin
  reviewCourseApproval,
  toggleCourseFeature,
  // Public/User
  getCourses,
  getCourse, // Lấy theo slug
  updateCourseThumbnail,
  updateCourseIntroVideo,
  syncCurriculum, // Đồng bộ curriculum
  getCourseStatuses,
  getCoursesByCategorySlug,
  getCoursesByInstructorId,
};
