// File: src/api/courses/courses.controller.js

const httpStatus = require('http-status').status;
const crypto = require('crypto');
const _ = require('lodash');
const courseRepository = require('./courses.repository');
const categoryRepository = require('../categories/categories.repository');
const levelRepository = require('../levels/levels.repository');
const ApiError = require('../../core/errors/ApiError');
const { generateSlug } = require('../../utils/slugify');
const CourseStatus = require('../../core/enums/CourseStatus');
const ApprovalStatus = require('../../core/enums/ApprovalStatus');
const ApprovalRequestType = require('../../core/enums/ApprovalRequestType');
const Roles = require('../../core/enums/Roles');
const logger = require('../../utils/logger');
const sectionRepository = require('../sections/sections.repository');
const lessonRepository = require('../lessons/lessons.repository');
const cloudinaryUtil = require('../../utils/cloudinary.util');
const enrollmentService = require('../enrollments/enrollments.service');
const notificationService = require('../notifications/notifications.service');
const progressService = require('../progress/progress.service');
const lessonAttachmentRepository = require('../lessons/lessonAttachment.repository');
const { getConnection, sql } = require('../../database/connection');
const authRepository = require('../auth/auth.repository');
const languageRepository = require('../languages/languages.repository');
const {
  toCamelCaseObject,
  toPascalCaseObject,
} = require('../../utils/caseConverter');
const userRepository = require('../users/users.repository');
const pricingUtil = require('../../utils/pricing.util');
const quizRepository = require('../quizzes/quizzes.repository');
const subtitleRepository = require('../lessons/subtitle.repository');
const LessonType = require('../../core/enums/LessonType');

/**
 * Tạo khóa học mới với payload tối giản (bởi Instructor).
 */
const createCourse = async (courseData, instructorId) => {
  const { courseName, categoryId, language, levelId } = courseData;
  const [category, instructorProfile, defaultLevel] = await Promise.all([
    categoryRepository.findCategoryById(categoryId),
    userRepository.findUserProfileById(instructorId),
    levelRepository.findLevelById(levelId || 1),
  ]);
  if (!category) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Danh mục không hợp lệ.');
  }
  if (!instructorProfile) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Không tìm thấy thông tin giảng viên.'
    );
  }
  if (!defaultLevel) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Cấp độ không hợp lệ.`);
  }
  const baseSlug = generateSlug(courseName);
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const uniqueSlug = `${baseSlug}-${randomSuffix}`;
  const fullCourseData = {
    CourseName: courseName,
    Slug: uniqueSlug,
    ShortDescription: `Một khóa học mới của ${instructorProfile.FullName}. Chi tiết sẽ được cập nhật sớm.`,
    FullDescription:
      '<p>Nội dung khóa học đang được giảng viên soạn thảo...</p>',
    Requirements: null,
    LearningOutcomes: null,
    ThumbnailUrl: null,
    IntroVideoUrl: null,
    OriginalPrice: 0,
    DiscountedPrice: null,
    InstructorID: instructorId,
    CategoryID: categoryId,
    LevelID: defaultLevel.LevelID,
    Language: language,
    StatusID: CourseStatus.DRAFT,
    PublishedAt: null,
    IsFeatured: false,
    ReviewCount: 0,
    AverageRating: null,
  };
  const createdCourse = await courseRepository.createCourse(fullCourseData);
  logger.info(
    `Draft course "${createdCourse.CourseName}" (ID: ${createdCourse.CourseID}) created by instructor ${instructorId}.`
  );
  return toCamelCaseObject(createdCourse);
};

/**
 * Lấy danh sách khóa học (có thể lọc theo nhiều tiêu chí).
 */
const getCourses = async (
  filters = {},
  options = {},
  user = null,
  targetCurrency
) => {
  const effectiveFilters = { ...filters };
  if (user) {
    if (user.role === Roles.INSTRUCTOR && effectiveFilters.userPage === false) {
      if (
        effectiveFilters.instructorId &&
        effectiveFilters.instructorId !== user.id
      ) {
        logger.warn(
          `Instructor ${user.id} trying to filter courses by another instructor ${effectiveFilters.instructorId}. Returning only published courses.`
        );
        effectiveFilters.instructorId = null;
        effectiveFilters.statusId = CourseStatus.PUBLISHED;
      } else {
        effectiveFilters.instructorId = user.id;
        effectiveFilters.statusId = filters.statusId || 'ALL';
      }
    } else if (
      (user.role === Roles.ADMIN || user.role === Roles.SUPERADMIN) &&
      effectiveFilters.userPage === false
    ) {
      effectiveFilters.statusId = filters.statusId || 'ALL';
    } else if (
      user.role === Roles.STUDENT ||
      effectiveFilters.userPage === true
    ) {
      effectiveFilters.statusId = CourseStatus.PUBLISHED;
    }
  } else {
    effectiveFilters.statusId = CourseStatus.PUBLISHED;
  }
  const { page = 1, limit = 10 } = options;
  const result = await courseRepository.findAllCourses(
    effectiveFilters,
    options
  );
  const coursesWithPricing = await Promise.all(
    result.courses.map(async (course) => {
      const pricing = await pricingUtil.createPricingObject(
        course,
        targetCurrency
      );
      delete course.OriginalPrice;
      delete course.DiscountedPrice;
      return { ...toCamelCaseObject(course), pricing };
    })
  );
  return {
    courses: coursesWithPricing,
    total: result.total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalPages: limit > 0 ? Math.ceil(result.total / limit) : 1,
  };
};

/**
 *  Lấy danh sách khóa học dựa trên bộ lọc và tùy chọn được cung cấp.
 * Hàm này không tự ý thêm filter, nó chỉ thực thi những gì được truyền vào.
 */
const queryCourses = async (
  filters = {},
  options = {},
  targetCurrency = 'VND'
) => {
  const { page = 1, limit = 10 } = options;

  // Gọi thẳng repository với filter đã được chuẩn bị sẵn từ service cha
  const result = await courseRepository.findAllCourses(filters, options);

  const coursesWithPricing = await Promise.all(
    result.courses.map(async (course) => {
      const pricing = await pricingUtil.createPricingObject(
        course,
        targetCurrency
      );
      // Giữ lại toCamelCaseObject để đảm bảo casing nhất quán
      const camelCaseCourse = toCamelCaseObject(course);
      delete camelCaseCourse.originalPrice;
      delete camelCaseCourse.discountedPrice;
      return { ...camelCaseCourse, pricing };
    })
  );

  return {
    courses: coursesWithPricing,
    total: result.total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalPages: limit > 0 ? Math.ceil(result.total / limit) : 1,
  };
};

/**
 * Lấy chi tiết một khóa học bằng slug, bao gồm TOÀN BỘ curriculum.
 */
const getCourseBySlug = async (slug, user = null, targetCurrency) => {
  const isAdmin =
    user && (user.role === Roles.ADMIN || user.role === Roles.SUPERADMIN);
  const isPotentiallyInstructor = user && user.role === Roles.INSTRUCTOR;
  const includeNonPublished = isAdmin || isPotentiallyInstructor;
  const course = await courseRepository.findCourseWithFullDetailsBySlug(
    slug,
    includeNonPublished
  );
  if (!course) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Course not found or not accessible.'
    );
  }
  const isPublished = course.StatusID === CourseStatus.PUBLISHED;
  const isOwnerInstructor =
    isPotentiallyInstructor && course.InstructorID === user.id;
  if (!isPublished && !isAdmin && !isOwnerInstructor) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'You do not have permission to view this course.'
    );
  }
  let isEnrolled = false;
  if (user && !isAdmin && !isOwnerInstructor) {
    try {
      isEnrolled = await enrollmentService.isUserEnrolled(
        user.id,
        course.CourseID
      );
    } catch (enrollmentError) {
      logger.error(
        `Error checking enrollment for user ${user.id} course ${course.CourseID}:`,
        enrollmentError
      );
    }
  }
  const canViewFullContent = isAdmin || isOwnerInstructor || isEnrolled;
  if (course.sections) {
    course.sections.forEach((section) => {
      if (section.lessons) {
        section.lessons.forEach((lesson) => {
          if (!lesson.IsFreePreview && !canViewFullContent) {
            lesson.TextContent =
              '*** Content available for enrolled students only ***';
          }
          if (lesson.VideoSourceType === 'CLOUDINARY') {
            lesson.ExternalVideoID = lesson.ExternalVideoID ? 'uploaded' : null;
          }
          if (!isAdmin && !isOwnerInstructor && lesson.questions) {
            lesson.questions.forEach((q) => {
              q.options?.forEach((o) => delete o.IsCorrectAnswer);
            });
          }
        });
      }
    });
  }
  course.isEnrolled = canViewFullContent;
  if (user && course.isEnrolled) {
    try {
      const progressData = await progressService.getCourseProgress(
        user,
        course.CourseID
      );
      logger.debug(`Course progress data for user ${user.id}:`, progressData);
      course.userProgress = progressData.progressDetails.reduce((acc, p) => {
        acc[p.LessonID] = {
          isCompleted: p.IsCompleted,
          lastWatchedPosition: p.LastWatchedPosition,
        };
        return acc;
      }, {});
    } catch (progressError) {
      if (
        !(
          progressError instanceof ApiError &&
          progressError.statusCode === httpStatus.FORBIDDEN
        )
      ) {
        logger.error(
          `Error fetching progress for user ${user.id}, course ${course.CourseID}:`,
          progressError
        );
      }
      course.userProgress = {};
    }
  } else {
    course.userProgress = {};
  }
  course.pricing = await pricingUtil.createPricingObject(
    course,
    targetCurrency
  );
  delete course.OriginalPrice;
  delete course.DiscountedPrice;
  return toCamelCaseObject(course);
};

/**
 * Cập nhật khóa học (bởi Instructor hoặc Admin).
 */
const updateCourse = async (courseId, updateBody, user) => {
  const course = await courseRepository.findCourseById(courseId, true);
  if (!course) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy khóa học.');
  }
  const isAdmin = user.role === Roles.ADMIN || user.role === Roles.SUPERADMIN;
  const isOwnerInstructor =
    user.role === Roles.INSTRUCTOR && course.InstructorID === user.id;
  if (!isAdmin && !isOwnerInstructor) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn không có quyền cập nhật khóa học này.'
    );
  }
  if (
    isOwnerInstructor &&
    ![CourseStatus.DRAFT, CourseStatus.REJECTED].includes(course.StatusID)
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Bạn chỉ có thể cập nhật khóa học khi ở trạng thái ${CourseStatus.DRAFT} hoặc ${CourseStatus.REJECTED}.`
    );
  }
  if (isAdmin && updateBody.instructorId !== undefined) {
    delete updateBody.instructorId;
    logger.warn(
      `Admin attempt to change instructorId for course ${courseId} was blocked.`
    );
  }
  if (isAdmin && updateBody.statusId !== undefined) {
    delete updateBody.statusId;
    logger.warn(
      `Admin attempt to change statusId directly for course ${courseId} was blocked. Use approve/reject API.`
    );
  }
  if (isOwnerInstructor) {
    delete updateBody.statusId;
  }
  const dataToUpdate = { ...updateBody };
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    if (updateBody.courseName && updateBody.courseName !== course.CourseName) {
      let newSlug = generateSlug(updateBody.courseName);
      const existingSlug = await courseRepository.findCourseIdBySlug(newSlug);
      if (existingSlug && existingSlug.CourseID !== courseId) {
        newSlug = `${newSlug}-${Math.random().toString(36).substring(2, 7)}`;
      }
      dataToUpdate.Slug = newSlug;
    }
    if (updateBody.categoryId && updateBody.categoryId !== course.CategoryID) {
      const category = await categoryRepository.findCategoryById(
        updateBody.categoryId
      );
      if (!category)
        throw new ApiError(httpStatus.BAD_REQUEST, 'Danh mục không hợp lệ.');
    }
    if (updateBody.levelId && updateBody.levelId !== course.LevelID) {
      const level = await levelRepository.findLevelById(updateBody.levelId);
      if (!level)
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cấp độ không hợp lệ.');
    }
    if (updateBody.language !== undefined) {
      const langExists = await languageRepository.findLanguageByCode(
        updateBody.language
      );
      if (!langExists || !langExists.IsActive) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Ngôn ngữ '${updateBody.language}' không hợp lệ hoặc không được kích hoạt.`
        );
      }
      dataToUpdate.Language = updateBody.language;
    }
    const updatedCourse = await courseRepository.updateCourseById(
      courseId,
      dataToUpdate,
      transaction
    );
    if (!updatedCourse) {
      logger.warn(
        `Update course ${courseId} returned null. Body: ${JSON.stringify(
          updateBody
        )}`
      );
      const currentCourse = await courseRepository.findCourseById(
        courseId,
        true
      );
      await transaction.commit();
      return currentCourse;
    }
    await transaction.commit();
    return toCamelCaseObject(updatedCourse);
  } catch (error) {
    logger.error(`Error updating course ${courseId}:`, error);
    if (transaction && transaction.active) {
      try {
        await transaction.rollback();
        logger.debug(`Transaction rolled back for course ${courseId}.`);
      } catch (rollbackError) {
        logger.error(
          `Failed to rollback transaction for course ${courseId}:`,
          rollbackError
        );
      }
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Cập nhật khóa học thất bại.'
    );
  }
};

/**
 * Xóa khóa học (bởi Instructor hoặc Admin).
 */
const deleteCourse = async (courseId, user) => {
  const course = await courseRepository.findCourseById(courseId, true);
  if (!course) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy khóa học.');
  }
  const isAdmin = user.role === Roles.ADMIN || user.role === Roles.SUPERADMIN;
  const isOwnerInstructor =
    user.role === Roles.INSTRUCTOR && course.InstructorID === user.id;
  if (!isAdmin && !isOwnerInstructor) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn không có quyền xóa khóa học này.'
    );
  }
  if (course.ThumbnailPublicId) {
    try {
      await cloudinaryUtil.deleteAsset(course.ThumbnailPublicId, {
        resource_type: 'image',
      });
      logger.info(
        `Course thumbnail deleted from Cloudinary: ${course.ThumbnailPublicId}`
      );
    } catch (error) {
      logger.error(
        `Failed to delete course thumbnail ${course.ThumbnailPublicId}:`,
        error
      );
    }
  }
  const sections = await sectionRepository.findSectionsByCourseId(courseId);
  for (const section of sections) {
    const lessons = await lessonRepository.findLessonsBySectionId(
      section.SectionID
    );
    for (const lesson of lessons) {
      if (lesson.ExternalVideoID) {
        try {
          await cloudinaryUtil.deleteAsset(lesson.ExternalVideoID, {
            resource_type: 'video',
          });
          logger.info(
            `Lesson video deleted from Cloudinary: ${lesson.ExternalVideoID}`
          );
        } catch (error) {
          logger.error(
            `Failed to delete lesson video ${lesson.ExternalVideoID}:`,
            error
          );
        }
      }
      const attachments =
        await lessonAttachmentRepository.findAttachmentsByLessonId(
          lesson.LessonID
        );
      for (const attachment of attachments) {
        if (attachment.CloudStorageID) {
          try {
            await cloudinaryUtil.deleteAsset(attachment.CloudStorageID, {
              resource_type: 'raw',
            });
            logger.info(
              `Lesson attachment deleted from Cloudinary: ${attachment.CloudStorageID}`
            );
          } catch (error) {
            logger.error(
              `Failed to delete lesson attachment ${attachment.CloudStorageID}:`,
              error
            );
          }
        }
      }
    }
  }
  if (
    isOwnerInstructor &&
    ![CourseStatus.DRAFT, CourseStatus.REJECTED].includes(course.StatusID)
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Bạn chỉ có thể xóa khóa học nháp hoặc bị từ chối.'
    );
  }
  await courseRepository.deleteCourseById(courseId);
  logger.info(`Course ${courseId} deleted by user ${user.id}`);
};

/**
 * Cập nhật thumbnail cho khóa học.
 */
const updateCourseThumbnail = async (courseId, file, user) => {
  const course = await courseRepository.findCourseById(courseId, true);
  if (!course) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy khóa học.');
  }
  const isAdmin = user.role === Roles.ADMIN || user.role === Roles.SUPERADMIN;
  const isOwnerInstructor =
    user.role === Roles.INSTRUCTOR && course.InstructorID === user.id;
  if (!isAdmin && !isOwnerInstructor) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn không có quyền cập nhật khóa học này.'
    );
  }
  if (
    isOwnerInstructor &&
    ![CourseStatus.DRAFT, CourseStatus.REJECTED].includes(course.StatusID)
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Bạn chỉ có thể cập nhật khóa học khi ở trạng thái ${CourseStatus.DRAFT} hoặc ${CourseStatus.REJECTED}.`
    );
  }
  if (!file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Vui lòng chọn file thumbnail.');
  }
  if (course.ThumbnailPublicId) {
    try {
      await cloudinaryUtil.deleteAsset(course.ThumbnailPublicId, {
        resource_type: 'image',
      });
      logger.info(
        `Old thumbnail deleted from Cloudinary: ${course.ThumbnailPublicId}`
      );
    } catch (deleteError) {
      logger.error(
        `Failed to delete old thumbnail ${course.ThumbnailPublicId}:`,
        deleteError
      );
    }
  }
  let uploadResult;
  try {
    const options = {
      folder: `courses/${courseId}/thumbnails`,
      resource_type: 'image',
    };
    uploadResult = await cloudinaryUtil.uploadStream(file.buffer, options);
  } catch (uploadError) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Upload thumbnail thất bại.'
    );
  }
  const updateData = {
    ThumbnailUrl: uploadResult.secure_url,
    ThumbnailPublicId: uploadResult.public_id,
  };
  let updatedCourse;
  try {
    updatedCourse = await courseRepository.updateCourseById(
      courseId,
      updateData
    );
    if (!updatedCourse) {
      throw new Error('Failed to update course in DB.');
    }
  } catch (dbError) {
    logger.error(
      `Failed to update course ${courseId} in DB after thumbnail upload. Uploaded public_id: ${uploadResult.public_id}`
    );
    try {
      await cloudinaryUtil.deleteAsset(uploadResult.public_id, {
        resource_type: 'image',
      });
      logger.info(
        `Rolled back thumbnail upload: Deleted ${uploadResult.public_id}`
      );
    } catch (rollbackError) {
      logger.error(
        `Failed to rollback thumbnail upload for ${uploadResult.public_id}:`,
        rollbackError
      );
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Cập nhật thông tin khóa học sau khi upload thất bại.'
    );
  }
  return toCamelCaseObject(updatedCourse);
};

/**
 * Cập nhật video giới thiệu cho khóa học (upload lên Cloudinary dạng public).
 */
const updateCourseIntroVideo = async (courseId, file, user) => {
  const course = await courseRepository.findCourseById(courseId, true);
  if (!course) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy khóa học.');
  }
  const isAdmin = user.role === Roles.ADMIN || user.role === Roles.SUPERADMIN;
  const isOwnerInstructor =
    user.role === Roles.INSTRUCTOR && course.InstructorID === user.id;
  if (!isAdmin && !isOwnerInstructor) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn không có quyền cập nhật khóa học này.'
    );
  }
  if (
    isOwnerInstructor &&
    ![CourseStatus.DRAFT, CourseStatus.REJECTED].includes(course.StatusID)
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Bạn chỉ có thể cập nhật khóa học khi ở trạng thái ${CourseStatus.DRAFT} hoặc ${CourseStatus.REJECTED}.`
    );
  }
  if (!file) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Vui lòng chọn file video giới thiệu.'
    );
  }
  if (course.IntroVideoPublicId) {
    try {
      await cloudinaryUtil.deleteAsset(course.IntroVideoPublicId, {
        resource_type: 'video',
        type: 'upload',
      });
      logger.info(
        `Old intro video deleted from Cloudinary: ${course.IntroVideoPublicId}`
      );
    } catch (deleteError) {
      logger.error(
        `Failed to delete old intro video ${course.IntroVideoPublicId}:`,
        deleteError
      );
    }
  }
  let uploadResult;
  try {
    const options = {
      folder: `courses/${courseId}/intro_videos`,
      resource_type: 'video',
      type: 'upload',
    };
    uploadResult = await cloudinaryUtil.uploadStream(file.buffer, options);
  } catch (uploadError) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Upload video giới thiệu thất bại.'
    );
  }
  const updateData = {
    IntroVideoUrl: uploadResult.secure_url,
    IntroVideoPublicId: uploadResult.public_id,
  };
  const updatedCourse = await courseRepository.updateCourseById(
    courseId,
    updateData
  );
  if (!updatedCourse) {
    logger.error(
      `Failed to update course ${courseId} in DB after intro video upload. Uploaded public_id: ${uploadResult.public_id}`
    );
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Cập nhật thông tin khóa học sau khi upload thất bại.'
    );
  }
  return toCamelCaseObject(updatedCourse);
};

/**
 * Giảng viên gửi yêu cầu duyệt khóa học.
 */
const submitCourseForApproval = async (courseId, user, notes = null) => {
  const course = await courseRepository.findCourseById(courseId, true);
  if (!course) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy khóa học.');
  }
  if (course.InstructorID !== user.id) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn không phải là giảng viên của khóa học này.'
    );
  }
  if (![CourseStatus.DRAFT, CourseStatus.REJECTED].includes(course.StatusID)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Chỉ có thể gửi duyệt khóa học nháp hoặc bị từ chối.'
    );
  }
  const existingRequest =
    await courseRepository.findPendingApprovalRequestByCourseId(courseId);
  if (existingRequest) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Khóa học này đã được gửi duyệt và đang chờ xử lý.'
    );
  }
  const sections = await sectionRepository.findSectionsByCourseId(courseId);
  if (!sections || sections.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Khóa học phải có ít nhất một phần (section) trước khi gửi duyệt.'
    );
  }
  const lessons = [];
  for (const section of sections) {
    const sectionLessons = await lessonRepository.findLessonsBySectionId(
      section.SectionID
    );
    lessons.push(...sectionLessons);
  }
  if (!lessons || lessons.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Khóa học phải có ít nhất một bài học (lesson) trước khi gửi duyệt.'
    );
  }
  const hasValidLessons = lessons.some(
    (lesson) => lesson.LessonName?.trim() && lesson.LessonType
  );
  if (!hasValidLessons) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Tất cả các bài học (lesson) trong khóa học phải có tên và loại hợp lệ.'
    );
  }
  await courseRepository.updateCourseById(courseId, {
    StatusID: CourseStatus.PENDING,
  });
  let requestType;
  if (course.LiveCourseID) {
    requestType = ApprovalRequestType.UPDATE_SUBMISSION;
  } else if (course.StatusID === CourseStatus.REJECTED) {
    requestType = ApprovalRequestType.RE_SUBMISSION;
  } else {
    requestType = ApprovalRequestType.INITIAL_SUBMISSION;
  }
  logger.info(`Submitting course ${courseId} with RequestType: ${requestType}`);
  const approvalRequest = await courseRepository.createCourseApprovalRequest({
    courseId,
    instructorId: user.id,
    requestType,
    instructorNotes: notes,
  });
  try {
    const course = await courseRepository.findCourseById(courseId, true);
    const message = `Giảng viên ${
      user.fullName || user.email
    } vừa gửi yêu cầu duyệt cho khóa học "${course?.CourseName || 'mới'}".`;
    const adminIds = await authRepository.findAccountIdsByRoles([
      Roles.ADMIN,
      Roles.SUPERADMIN,
    ]);
    for (const adminIdObj of adminIds) {
      const adminId =
        typeof adminIdObj === 'object' && adminIdObj.AccountID
          ? adminIdObj.AccountID
          : adminIdObj;
      await notificationService.createNotification(
        adminId,
        'COURSE_SUBMITTED',
        message,
        { type: 'CourseApprovalRequest', id: approvalRequest.RequestID }
      );
    }
  } catch (notifyError) {
    logger.error(
      `Failed to send notification for course submission ${courseId}:`,
      notifyError
    );
  }
  return toCamelCaseObject(approvalRequest);
};

/**
 * Lấy yêu cầu duyệt khóa học đang chờ xử lý (PENDING) theo CourseID.
 */
const getPendingApprovalRequestByCourseId = async (courseId) => {
  const request =
    await courseRepository.findPendingApprovalRequestByCourseId(courseId);
  return request ? toCamelCaseObject(request) : null;
};

/**
 * [HELPER 1] Clone CÁC THÀNH PHẦN CON của một lesson sang một lesson khác.
 */
async function cloneLessonSubComponents(
  fromLesson,
  toLessonId,
  transaction,
  skipQuiz = false
) {
  if (
    !skipQuiz &&
    fromLesson.lessonType === LessonType.QUIZ &&
    fromLesson.questions?.length > 0
  ) {
    for (const question of fromLesson.questions) {
      const newQuestion = await quizRepository.createQuestion(
        toPascalCaseObject({
          lessonId: toLessonId,
          ...question,
        }),
        transaction
      );
      if (question.options?.length > 0) {
        const optionsData = question.options.map((opt) =>
          toCamelCaseObject(opt)
        );
        await quizRepository.createOptionsForQuestion(
          newQuestion.QuestionID,
          optionsData,
          transaction
        );
      }
    }
  }
  if (fromLesson.attachments?.length > 0) {
    for (const attachment of fromLesson.attachments) {
      await lessonAttachmentRepository.createAttachment(
        toPascalCaseObject({ lessonId: toLessonId, ...attachment }),
        transaction
      );
    }
  }
  if (fromLesson.subtitles?.length > 0) {
    for (const subtitle of fromLesson.subtitles) {
      await subtitleRepository.addSubtitle(
        toPascalCaseObject({ lessonId: toLessonId, ...subtitle }),
        transaction
      );
    }
  }
}

/**
 * [HELPER 2] Clone MỘT LESSON ĐẦY ĐỦ.
 */
async function cloneFullLesson(lessonToClone, newSectionId, transaction) {
  const newLessonData = {
    ...lessonToClone,
    sectionId: newSectionId,
    originalId: null,
  };
  const newLesson = await lessonRepository.createLesson(
    toPascalCaseObject(newLessonData),
    transaction
  );
  await cloneLessonSubComponents(
    lessonToClone,
    newLesson.LessonID,
    transaction
  );
}

/**
 * [HELPER 3] Đồng bộ hóa Quiz cho một lesson bằng "Archive và Tạo lại".
 */
async function syncQuizForLesson(updateQuestions, liveLessonId, transaction) {
  await quizRepository.archiveQuestionsByLessonId(liveLessonId, transaction);
  if (updateQuestions?.length > 0) {
    for (const uQuestion of updateQuestions) {
      const newQuestion = await quizRepository.createQuestion(
        {
          LessonID: liveLessonId,
          QuestionText: uQuestion.questionText,
          Explanation: uQuestion.explanation,
          QuestionOrder: uQuestion.questionOrder,
        },
        transaction
      );
      if (uQuestion.options?.length > 0) {
        const optionsData = uQuestion.options.map((opt) => ({
          optionText: opt.optionText,
          isCorrectAnswer: opt.isCorrectAnswer,
          optionOrder: opt.optionOrder,
        }));
        await quizRepository.createOptionsForQuestion(
          newQuestion.QuestionID,
          optionsData,
          transaction
        );
      }
    }
  }
}

/**
 * [HELPER 5] Đồng bộ hóa các lessons cho một section.
 */
async function syncLessonsForSection(
  updateLessons,
  liveSectionId,
  transaction
) {
  const cloudFilesToDelete = [];
  const liveLessonsRaw =
    await lessonRepository.findAllLessonsWithDetailsBySectionIds(
      [liveSectionId],
      transaction
    );
  const liveLessons = toCamelCaseObject(
    liveLessonsRaw.filter((l) => !l.isArchived)
  );
  const updateLessonsMap = new Map(
    (updateLessons || []).map((l) => [l.originalId, l])
  );
  const liveLessonsMapById = new Map(liveLessons.map((l) => [l.lessonId, l]));
  const lessonsToArchiveIds = [];
  for (const [liveLessonId] of liveLessonsMapById.entries()) {
    if (!updateLessonsMap.has(liveLessonId)) {
      lessonsToArchiveIds.push(liveLessonId);
    }
  }
  if (lessonsToArchiveIds.length > 0) {
    await lessonRepository.archiveLessonsByIds(
      lessonsToArchiveIds,
      transaction
    );
  }
  for (const updateLesson of updateLessons || []) {
    const originalLessonId = updateLesson.originalId;
    logger.debug(
      `[syncLessonsForSection] Processing lesson: ${updateLesson.lessonName} (ID: ${originalLessonId})`,
      { updateLesson }
    );
    if (originalLessonId && liveLessonsMapById.has(originalLessonId)) {
      const liveLesson = liveLessonsMapById.get(originalLessonId);
      const oldVideoId = liveLesson.externalVideoId;
      const newVideoId = updateLesson.externalVideoId;
      if (
        liveLesson.lessonType === 'VIDEO' &&
        oldVideoId &&
        newVideoId !== oldVideoId &&
        liveLesson.videoSourceType === 'CLOUDINARY'
      ) {
        cloudFilesToDelete.push({
          publicId: oldVideoId,
          resourceType: 'video',
        });
      }
      await lessonRepository.updateLessonById(
        originalLessonId,
        toPascalCaseObject(updateLesson),
        transaction
      );
      await syncQuizForLesson(
        updateLesson.questions || [],
        originalLessonId,
        transaction
      );
      const attachmentsResult =
        await lessonAttachmentRepository.deleteAttachmentsByLessonId(
          originalLessonId,
          transaction
        );
      cloudFilesToDelete.push(...attachmentsResult.filesToDelete);
      if (updateLesson.attachments?.length > 0) {
        for (const attachment of updateLesson.attachments) {
          const newAttachmentData = {
            LessonID: originalLessonId,
            FileName: attachment.fileName,
            FileURL: attachment.fileUrl,
            FileType: attachment.fileType,
            FileSize: attachment.fileSize,
            CloudStorageID: attachment.cloudStorageId,
          };
          await lessonAttachmentRepository.createAttachment(
            newAttachmentData,
            transaction
          );
        }
      }
      await subtitleRepository.deleteSubtitlesByLessonId(
        originalLessonId,
        transaction
      );
      if (updateLesson.subtitles?.length > 0) {
        for (const subtitle of updateLesson.subtitles) {
          const newSubtitleData = {
            LessonID: originalLessonId,
            LanguageCode: subtitle.languageCode,
            SubtitleUrl: subtitle.subtitleUrl,
            IsDefault: subtitle.isDefault,
          };
          await subtitleRepository.addSubtitle(newSubtitleData, transaction);
        }
      }
    } else {
      await cloneFullLesson(updateLesson, liveSectionId, transaction);
    }
  }
  return cloudFilesToDelete;
}

/**
 * [HÀM CHÍNH - FINAL] Thực hiện logic "Smart Sync" từ bản sao sang bản gốc.
 */
async function syncLiveCourseFromUpdate(
  updateCourseId,
  liveCourseId,
  transaction
) {
  logger.info(
    `Starting Diff-and-Patch Sync from course ${updateCourseId} to ${liveCourseId}`
  );
  const allCloudFilesToDelete = [];
  const updateCurriculumRaw =
    await sectionRepository.findAllSectionsWithDetails(
      updateCourseId,
      transaction
    );
  const liveCurriculumRaw = await sectionRepository.findAllSectionsWithDetails(
    liveCourseId,
    transaction
  );
  const updateCurriculum = toCamelCaseObject(updateCurriculumRaw);
  const liveCurriculum = toCamelCaseObject(
    liveCurriculumRaw.filter((s) => !s.isArchived)
  );
  const updateSectionsMap = new Map(
    updateCurriculum.map((s) => [s.originalId, s])
  );
  const liveSectionsMapById = new Map(
    liveCurriculum.map((s) => [s.sectionId, s])
  );
  const sectionsToArchiveIds = [];
  for (const [liveSectionId] of liveSectionsMapById.entries()) {
    if (!updateSectionsMap.has(liveSectionId)) {
      sectionsToArchiveIds.push(liveSectionId);
    }
  }
  if (sectionsToArchiveIds.length > 0) {
    await sectionRepository.archiveSectionsByIds(
      sectionsToArchiveIds,
      transaction
    );
  }
  for (const updateSection of updateCurriculum) {
    const originalSectionId = updateSection.originalId;
    if (originalSectionId && liveSectionsMapById.has(originalSectionId)) {
      await sectionRepository.updateSectionById(
        originalSectionId,
        toPascalCaseObject(updateSection),
        transaction
      );
      const filesFromLessons = await syncLessonsForSection(
        updateSection.lessons || [],
        originalSectionId,
        transaction
      );
      allCloudFilesToDelete.push(...filesFromLessons);
    } else {
      await cloneFullLesson(updateSection, liveCourseId, transaction);
    }
  }
  const updateCourseDataRaw = await courseRepository.findCourseById(
    updateCourseId,
    true,
    transaction
  );
  const updateCourseData = toCamelCaseObject(updateCourseDataRaw);
  await courseRepository.updateCourseById(
    liveCourseId,
    toPascalCaseObject({
      courseName: updateCourseData.courseName,
      shortDescription: updateCourseData.shortDescription,
      fullDescription: updateCourseData.fullDescription,
      requirements: updateCourseData.requirements,
      learningOutcomes: updateCourseData.learningOutcomes,
      originalPrice: updateCourseData.originalPrice,
      discountedPrice: updateCourseData.discountedPrice,
      categoryId: updateCourseData.categoryId,
      levelId: updateCourseData.levelId,
      language: updateCourseData.language,
    }),
    transaction
  );
  logger.info(`Synced course-level details to live course ${liveCourseId}`);
  return allCloudFilesToDelete;
}

/**
 * Admin phê duyệt hoặc từ chối khóa học.
 */
const reviewCourseApproval = async (
  requestId,
  decision,
  user,
  adminNotes = null
) => {
  let updatedRequest;
  const cloudFilesToDeleteAfterCommit = [];
  const approvalRequest =
    await courseRepository.findCourseApprovalRequestById(requestId);
  if (!approvalRequest) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Không tìm thấy yêu cầu duyệt hoặc yêu cầu đã được xử lý.'
    );
  }
  if (approvalRequest.Status !== ApprovalStatus.PENDING) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Yêu cầu này đã được xử lý.');
  }
  const courseId = approvalRequest.CourseID;
  let newCourseStatus;
  const publishedAt = null;
  let courseData;
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    if (
      decision === ApprovalStatus.APPROVED &&
      approvalRequest.RequestType === ApprovalRequestType.UPDATE_SUBMISSION
    ) {
      const updateCourseId = approvalRequest.CourseID;
      const liveCourse = await courseRepository.findCourseById(
        updateCourseId,
        true,
        transaction
      );
      const liveCourseId = liveCourse.LiveCourseID;
      if (!liveCourseId) {
        throw new ApiError(
          httpStatus.INTERNAL_SERVER_ERROR,
          'Cannot find live course to apply update.'
        );
      }
      const filesFromSync = await syncLiveCourseFromUpdate(
        updateCourseId,
        liveCourseId,
        transaction
      );
      cloudFilesToDeleteAfterCommit.push(...filesFromSync);
      logger.info(
        `Sync complete. Deleting update draft course ${updateCourseId} from database.`
      );
      updatedRequest = await courseRepository.updateApprovalRequestStatus(
        requestId,
        {
          status: decision,
          adminId: user.id,
          adminNotes,
        },
        transaction
      );
      courseData = await courseRepository.findCourseById(courseId);
      await courseRepository.deleteCourseById(updateCourseId, transaction);
      logger.info(
        `Update from course ${updateCourseId} successfully synced and applied to live course ${liveCourseId}.`
      );
    } else {
      if (decision === ApprovalStatus.REJECTED) {
        newCourseStatus = CourseStatus.REJECTED;
      } else if (decision === ApprovalStatus.NEEDS_REVISION) {
        newCourseStatus = CourseStatus.REJECTED;
      } else if (
        decision === ApprovalStatus.APPROVED &&
        approvalRequest.RequestType === ApprovalRequestType.INITIAL_SUBMISSION
      ) {
        newCourseStatus = CourseStatus.PUBLISHED;
      } else {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Quyết định không hợp lệ.');
      }
      courseData = await courseRepository.findCourseById(courseId);
      updatedRequest = await courseRepository.updateApprovalRequestStatus(
        requestId,
        {
          status: decision,
          adminId: user.id,
          adminNotes,
        },
        transaction
      );
      const courseUpdateData = { StatusID: newCourseStatus };
      if (publishedAt) {
        courseUpdateData.PublishedAt = publishedAt;
      }
      await courseRepository.updateCourseById(
        courseId,
        courseUpdateData,
        transaction
      );
    }
    await transaction.commit();
    try {
      const instructorId = approvalRequest.InstructorID;
      let notifyMessage = '';
      let notifyType = '';
      if (decision === ApprovalStatus.APPROVED) {
        notifyMessage = `Khóa học "${
          courseData?.CourseName || 'của bạn'
        }" đã được phê duyệt và xuất bản!`;
        notifyType = 'COURSE_APPROVED';
      } else if (decision === ApprovalStatus.REJECTED) {
        notifyMessage = `Khóa học "${
          courseData?.CourseName || 'của bạn'
        }" đã bị từ chối.${adminNotes ? ` Lý do: ${adminNotes}` : ''}`;
        notifyType = 'COURSE_REJECTED';
      }
      if (notifyType) {
        await notificationService.createNotification(
          instructorId,
          notifyType,
          notifyMessage,
          { type: 'Course', id: courseId }
        );
      }
    } catch (notifyError) {
      logger.error(
        `Failed to send notification for course review ${requestId}:`,
        notifyError
      );
    }
    for (const file of cloudFilesToDeleteAfterCommit) {
      try {
        await cloudinaryUtil.deleteAsset(file.publicId, {
          resource_type: file.resourceType || 'raw',
        });
        logger.info(
          `Deleted cloud file ${file.publicId} of type ${file.resourceType}`
        );
      } catch (deleteError) {
        logger.error(
          `Failed to delete cloud file ${file.publicId}:`,
          deleteError
        );
      }
    }
    return toCamelCaseObject(updatedRequest);
  } catch (error) {
    logger.error(`Error reviewing approval request ${requestId}:`, error);
    await transaction.rollback();
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Xử lý yêu cầu duyệt thất bại.'
    );
  }
};

/**
 * Admin đánh dấu/bỏ đánh dấu khóa học nổi bật.
 */
const toggleCourseFeature = async (courseId, isFeatured, user) => {
  const course = await courseRepository.findCourseById(courseId, true);
  if (!course) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy khóa học.');
  }
  if (isFeatured && course.StatusID !== CourseStatus.PUBLISHED) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Chỉ có thể đánh dấu nổi bật cho khóa học đã xuất bản.'
    );
  }
  const updatedCourse = await courseRepository.updateCourseById(courseId, {
    IsFeatured: isFeatured,
  });
  if (!updatedCourse) {
    logger.warn(
      `Toggle feature for course ${courseId} to ${isFeatured} returned null.`
    );
    return course;
  }
  logger.info(
    `Admin ${user.id} set IsFeatured=${isFeatured} for course ${courseId}`
  );
  return updatedCourse;
};

/**
 * Admin: Lấy danh sách các yêu cầu phê duyệt khóa học.
 */
const getApprovalRequests = async (filters = {}, options = {}) => {
  const { page = 1, limit = 10, sortBy } = options;
  const result = await courseRepository.findCourseApprovalRequests(filters, {
    page,
    limit,
    sortBy,
  });
  return {
    requests: toCamelCaseObject(result.requests),
    total: result.total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalPages: Math.ceil(result.total / limit),
  };
};

/**
 * Admin: Lấy chi tiết một yêu cầu phê duyệt.
 */
const getApprovalRequestDetails = async (requestId) => {
  const requestDetails =
    await courseRepository.findCourseApprovalRequestById(requestId);
  if (!requestDetails) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Không tìm thấy yêu cầu phê duyệt.'
    );
  }
  return toCamelCaseObject(requestDetails);
};

/**
 * Lấy tất cả trạng thái khóa học.
 */
const getCourseStatuses = async () => {
  const statuses = await courseRepository.getAllCourseStatuses();
  return toCamelCaseObject(statuses);
};

/**
 * Query for courses by category slug with pagination and filtering.
 */
const queryCoursesByCategorySlug = async (
  categorySlug,
  filterOptions,
  paginationOptions,
  targetCurrency = 'USD'
) => {
  const category = await categoryRepository.findCategoryBySlug(categorySlug);
  if (!category) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');
  }
  const combinedFilterOptions = {
    ...filterOptions,
    categoryId: category.CategoryID,
    statusId: CourseStatus.PUBLISHED,
  };
  const courses = await courseRepository.findAllCourses(
    combinedFilterOptions,
    paginationOptions
  );
  for (const course of courses.courses) {
    course.pricing = await pricingUtil.createPricingObject(
      course,
      targetCurrency
    );
  }
  return toCamelCaseObject(courses);
};

/**
 * Hủy một phiên cập nhật và khôi phục trạng thái của khóa học gốc.
 */
const cancelUpdate = async (updateCourseId, user) => {
  const draftCourse = await courseRepository.findCourseById(
    updateCourseId,
    true
  );
  if (!draftCourse || !draftCourse.LiveCourseID) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Không tìm thấy phiên bản cập nhật hợp lệ.'
    );
  }
  const liveCourseId = draftCourse.LiveCourseID;
  const originalCourse = await courseRepository.findCourseById(
    liveCourseId,
    true
  );
  if (!originalCourse || originalCourse.InstructorID !== user.id) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn không có quyền thực hiện hành động này.'
    );
  }
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    await courseRepository.updateCourseById(
      liveCourseId,
      { StatusID: CourseStatus.PUBLISHED },
      transaction
    );
    await courseRepository.deleteCourseById(updateCourseId, transaction);
    await transaction.commit();
    return { originalCourseSlug: originalCourse.Slug };
  } catch (error) {
    await transaction.rollback();
    logger.error(
      `Error cancelling update session for draft course ${updateCourseId}:`,
      error
    );
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Hủy phiên cập nhật thất bại.'
    );
  }
};

/**
 * Tạo một phiên cập nhật (bản sao) cho một khóa học đã xuất bản.
 */
const createUpdateSession = async (courseId, user) => {
  const originalCourse = await courseRepository.findCourseById(courseId, true);
  if (!originalCourse) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy khóa học gốc.');
  }
  if (originalCourse.InstructorID !== user.id) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn không phải là giảng viên của khóa học này.'
    );
  }
  if (originalCourse.StatusID !== CourseStatus.PUBLISHED) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Chỉ có thể tạo phiên cập nhật cho khóa học đã xuất bản.'
    );
  }
  const existingDraft =
    await courseRepository.findExistingUpdateDraft(courseId);
  if (existingDraft) {
    logger.warn(
      `Found an existing update draft (ID: ${existingDraft.CourseID}) for live course ${courseId}. Automatically cancelling it.`
    );
    try {
      await cancelUpdate(existingDraft.CourseID, user);
    } catch (cancelError) {
      logger.error(
        `Failed to automatically cancel old update session ${existingDraft.CourseID}. Please try again.`,
        cancelError
      );
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Không thể dọn dẹp phiên cập nhật cũ. Vui lòng thử lại.'
      );
    }
  }
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const newDraftCourse = await courseRepository.cloneCourseRecord(
      courseId,
      {
        StatusID: CourseStatus.DRAFT,
        LiveCourseID: courseId,
      },
      transaction
    );
    await courseRepository.cloneCurriculum(
      courseId,
      newDraftCourse.CourseID,
      transaction
    );
    await transaction.commit();
    const fullNewDraft = await courseRepository.findCourseWithFullDetailsById(
      newDraftCourse.CourseID,
      true
    );
    return toCamelCaseObject(fullNewDraft);
  } catch (error) {
    await transaction.rollback();
    logger.error(
      `Error creating update session for course ${courseId}:`,
      error
    );
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Tạo phiên cập nhật thất bại.'
    );
  }
};

// Lấy danh sách khóa học của chính giảng viên đang đăng nhập.
const getMyCourses = async (instructorId, filters, options, targetCurrency) => {
  const effectiveFilters = {
    ...filters,
    instructorId,
  };
  if (!effectiveFilters.statusId) {
    effectiveFilters.statusId = 'ALL';
  }
  return queryCourses(effectiveFilters, options, targetCurrency);
};

// Lấy danh sách các khóa học đã xuất bản (cho trang public). => ch đc xài
const getPublicCourses = async (filters, options, targetCurrency) => {
  const effectiveFilters = {
    ...filters,
    statusId: CourseStatus.PUBLISHED,
  };
  return queryCourses(effectiveFilters, options, targetCurrency);
};

module.exports = {
  createCourse,
  getCourses,
  getCourseBySlug,
  updateCourse,
  deleteCourse,
  updateCourseThumbnail,
  updateCourseIntroVideo,
  submitCourseForApproval,
  reviewCourseApproval,
  getApprovalRequests,
  getApprovalRequestDetails,
  toggleCourseFeature,
  getPendingApprovalRequestByCourseId,
  getCourseStatuses,
  queryCoursesByCategorySlug,

  createUpdateSession,
  cancelUpdate,
  getMyCourses,
  getPublicCourses,
};
