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
const { toCamelCaseObject } = require('../../utils/caseConverter');
const userRepository = require('../users/users.repository');
const pricingUtil = require('../../utils/pricing.util');

/**
 * Tạo khóa học mới với payload tối giản (bởi Instructor).
 * @param {object} courseData - { courseName, categoryId, language, levelId? }.
 * @param {number} instructorId - ID của giảng viên tạo khóa học (từ req.user).
 * @returns {Promise<object>} - Khóa học mới được tạo (trạng thái DRAFT).
 */
const createCourse = async (courseData, instructorId) => {
  const { courseName, categoryId, language, levelId } = courseData;

  // 1. Lấy thông tin cần thiết để điền giá trị mặc định
  const [category, instructorProfile, defaultLevel] = await Promise.all([
    categoryRepository.findCategoryById(categoryId),
    userRepository.findUserProfileById(instructorId),
    levelRepository.findLevelById(levelId || 1), // <<< Lấy level được cung cấp hoặc mặc định ID=1 ("Beginner")
  ]);

  // 2. Kiểm tra sự tồn tại của các bản ghi liên quan
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
    // Kiểm tra nếu levelId được cung cấp nhưng không hợp lệ
    throw new ApiError(httpStatus.BAD_REQUEST, `Cấp độ không hợp lệ.`);
  }

  // 3. Tạo slug duy nhất
  const baseSlug = generateSlug(courseName);
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const uniqueSlug = `${baseSlug}-${randomSuffix}`;

  // 4. Chuẩn bị dữ liệu đầy đủ để tạo khóa học
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
 * Dùng cho cả public, instructor và admin, quyền xem dữ liệu được kiểm soát ở repository/service.
 * @param {object} filters - Bộ lọc (categoryId, levelId, instructorId, statusId, searchTerm,...).
 * @param {object} options - Phân trang và sắp xếp (page, limit, sortBy).
 * @param {object|null} user - Thông tin user đang đăng nhập (nếu có).
 * @param {string} targetCurrency - Mã tiền tệ muốn hiển thị giá (ví dụ: 'USD', 'VND').
 * @returns {Promise<object>} - { courses, total, page, limit, totalPages }.
 */
const getCourses = async (
  // Không có lỗi
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

  console.log('effectiveFilters', effectiveFilters);

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
 * Lấy chi tiết một khóa học bằng slug, bao gồm TOÀN BỘ curriculum.
 * Xử lý quyền xem dựa trên trạng thái khóa học và vai trò người dùng.
 * @param {string} slug
 * @param {object|null} user - Thông tin user đang đăng nhập (nếu có).
 * @returns {Promise<object>} - Chi tiết khóa học với cấu trúc nội dung.
 */
const getCourseBySlug = async (slug, user = null, targetCurrency) => {
  const isAdmin =
    user && (user.role === Roles.ADMIN || user.role === Roles.SUPERADMIN);
  const isPotentiallyInstructor = user && user.role === Roles.INSTRUCTOR;

  // Lấy dữ liệu đầy đủ, bao gồm cả bản nháp nếu là admin hoặc instructor
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

  // Kiểm tra lại quyền truy cập cụ thể sau khi đã lấy được dữ liệu
  const isPublished = course.StatusID === CourseStatus.PUBLISHED;
  const isOwnerInstructor =
    isPotentiallyInstructor && course.InstructorID === user.id;

  if (!isPublished && !isAdmin && !isOwnerInstructor) {
    // Nếu không publish VÀ người xem không phải admin/owner -> Forbidden
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'You do not have permission to view this course.'
    );
  }

  // 4. Kiểm tra trạng thái đăng ký nếu là người dùng thông thường xem khóa học published
  // --- Xử lý ẩn nội dung bài học nếu cần (dựa trên enrollment) ---
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

  // 5. Xác định quyền xem TOÀN BỘ NỘI DUNG (video private, text trả phí)
  const canViewFullContent = isAdmin || isOwnerInstructor || isEnrolled;

  // Lặp qua curriculum để điều chỉnh dữ liệu trả về
  if (course.sections) {
    course.sections.forEach((section) => {
      if (section.lessons) {
        section.lessons.forEach((lesson) => {
          // Ẩn nội dung nếu không có quyền xem full
          if (!lesson.IsFreePreview && !canViewFullContent) {
            lesson.TextContent =
              '*** Content available for enrolled students only ***';
            // Không cần xóa video URL vì Signed URL sẽ được lấy qua API riêng
          }
          if (lesson.VideoSourceType === 'CLOUDINARY') {
            lesson.ExternalVideoID = lesson.ExternalVideoID ? 'uploaded' : null;
          }
          // Xóa đáp án đúng của Quiz nếu user không phải owner/admin
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
        // Bỏ qua lỗi Forbidden (chưa enroll)
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
 * @param {number} courseId
 * @param {object} updateBody - Dữ liệu cập nhật.
 * @param {object} user - Người dùng thực hiện (để kiểm tra quyền).
 * @returns {Promise<object>} - Khóa học đã cập nhật.
 */
const updateCourse = async (courseId, updateBody, user) => {
  const course = await courseRepository.findCourseById(courseId, true);
  if (!course) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy khóa học.');
  }

  const isAdmin = user.role === Roles.ADMIN || user.role === Roles.SUPERADMIN;
  const isOwnerInstructor =
    user.role === Roles.INSTRUCTOR && course.InstructorID === user.id;

  // Kiểm tra quyền cập nhật
  if (!isAdmin && !isOwnerInstructor) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn không có quyền cập nhật khóa học này.'
    );
  }

  // Giảng viên chỉ được sửa khi khóa học ở trạng thái DRAFT hoặc REJECTED
  if (
    isOwnerInstructor &&
    ![CourseStatus.DRAFT, CourseStatus.REJECTED].includes(course.StatusID)
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Bạn chỉ có thể cập nhật khóa học khi ở trạng thái ${CourseStatus.DRAFT} hoặc ${CourseStatus.REJECTED}.`
    );
  }

  // Admin không được phép đổi InstructorID qua API này
  if (isAdmin && updateBody.instructorId !== undefined) {
    delete updateBody.instructorId;
    logger.warn(
      `Admin attempt to change instructorId for course ${courseId} was blocked.`
    );
  }
  // Admin không nên đổi trực tiếp StatusID qua API này, nên dùng API duyệt/từ chối
  if (isAdmin && updateBody.statusId !== undefined) {
    delete updateBody.statusId;
    logger.warn(
      `Admin attempt to change statusId directly for course ${courseId} was blocked. Use approve/reject API.`
    );
  }
  // Không cho phép instructor tự đổi status hoặc IsFeatured
  if (isOwnerInstructor) {
    delete updateBody.statusId;
    delete updateBody.isFeatured;
  }

  const dataToUpdate = { ...updateBody };
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // Xử lý slug nếu tên khóa học thay đổi
    if (updateBody.courseName && updateBody.courseName !== course.CourseName) {
      let newSlug = generateSlug(updateBody.courseName);
      const existingSlug = await courseRepository.findCourseIdBySlug(newSlug);
      if (existingSlug && existingSlug.CourseID !== courseId) {
        newSlug = `${newSlug}-${Math.random().toString(36).substring(2, 7)}`;
      }
      dataToUpdate.Slug = newSlug;
    }

    // Kiểm tra Category/Level nếu có thay đổi
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
      // Chỉ kiểm tra nếu có gửi lên
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
 * @param {number} courseId
 * @param {object} user - Người dùng thực hiện.
 * @returns {Promise<void>}
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

  // 2. Lấy tất cả lessons của khóa học để xóa video và attachments
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

      // Xóa attachments của lesson
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
 * @param {number} courseId
 * @param {object} file - File object từ multer (req.file).
 * @param {object} user - Người dùng thực hiện.
 * @returns {Promise<object>} - Khóa học với thumbnail đã cập nhật.
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

  // Xóa thumbnail cũ trên Cloudinary nếu có
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

  // Upload thumbnail mới lên Cloudinary
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

  // Cập nhật DB
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
 * @param {number} courseId
 * @param {object} file - File object từ multer (req.file).
 * @param {object} user - Người dùng thực hiện (Instructor/Admin).
 * @returns {Promise<object>} - Khóa học với IntroVideoUrl đã cập nhật.
 */
const updateCourseIntroVideo = async (courseId, file, user) => {
  const course = await courseRepository.findCourseById(courseId, true); // Lấy cả draft
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

  // Upload video mới lên Cloudinary (dạng public)
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

  // Cập nhật DB chỉ với URL công khai
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

// --- Course Approval Flow ---

/**
 * Giảng viên gửi yêu cầu duyệt khóa học.
 * @param {number} courseId
 * @param {object} user - Giảng viên gửi.
 * @param {string} [notes] - Ghi chú của giảng viên.
 * @returns {Promise<object>} - Yêu cầu duyệt đã tạo.
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

  // Kiểm tra xem đã có request PENDING chưa
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

  // Lấy danh sách bài học từ các sections
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

  // Kiểm tra từng bài học để đảm bảo dữ liệu hợp lệ
  const hasValidLessons = lessons.some(
    (lesson) => lesson.LessonName?.trim() && lesson.LessonType
  );
  if (!hasValidLessons) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Tất cả các bài học (lesson) trong khóa học phải có tên và loại hợp lệ.'
    );
  }
  // Cập nhật trạng thái khóa học thành PENDING
  await courseRepository.updateCourseById(courseId, {
    StatusID: CourseStatus.PENDING,
  });

  // Tạo request approval
  const requestType =
    course.StatusID === CourseStatus.REJECTED
      ? ApprovalRequestType.RE_SUBMISSION
      : ApprovalRequestType.INITIAL_SUBMISSION;
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
    adminIds.forEach((adminId) => {
      notificationService.createNotification(
        adminId,
        'COURSE_SUBMITTED',
        message,
        { type: 'CourseApprovalRequest', id: approvalRequest.RequestID }
      );
    });
  } catch (notifyError) {
    logger.error(
      `Failed to send notification for course submission ${courseId}:`,
      notifyError
    );
  }
  return toCamelCaseObject(approvalRequest);
};

/**
 * Admin phê duyệt hoặc từ chối khóa học.
 * @param {number} requestId - ID của CourseApprovalRequests.
 * @param {string} decision - 'APPROVED' hoặc 'REJECTED' hoặc 'NEEDS_REVISION'.
 * @param {object} user - Admin thực hiện.
 * @param {string} [adminNotes] - Ghi chú của admin.
 * @returns {Promise<object>} - Yêu cầu duyệt đã cập nhật.
 */
const reviewCourseApproval = async (
  requestId,
  decision,
  user,
  adminNotes = null
) => {
  console.log('Review course approval:', requestId, decision, user, adminNotes);
  const approvalRequest =
    await courseRepository.findCourseApprovalRequestById(requestId);

  if (!approvalRequest) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Không tìm thấy yêu cầu duyệt hoặc yêu cầu đã được xử lý.'
    );
  }
  console.log('Approval request:', approvalRequest); // Debug log
  if (approvalRequest.Status !== ApprovalStatus.PENDING) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Yêu cầu này đã được xử lý.');
  }

  const courseId = approvalRequest.CourseID;
  let newCourseStatus;
  let publishedAt = null;

  if (decision === ApprovalStatus.APPROVED) {
    newCourseStatus = CourseStatus.PUBLISHED;
    publishedAt = new Date();
  } else if (decision === ApprovalStatus.REJECTED) {
    newCourseStatus = CourseStatus.REJECTED;
  } else if (decision === ApprovalStatus.NEEDS_REVISION) {
    newCourseStatus = CourseStatus.REJECTED;
  } else {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Quyết định không hợp lệ.');
  }

  // Bắt đầu transaction
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // 1. Cập nhật trạng thái CourseApprovalRequest
    const updatedRequest = await courseRepository.updateApprovalRequestStatus(
      requestId,
      {
        status: decision,
        adminId: user.id,
        adminNotes,
      },
      transaction
    );

    // 2. Cập nhật trạng thái Course và PublishedAt (nếu approved)
    const courseUpdateData = { StatusID: newCourseStatus };
    if (publishedAt) {
      courseUpdateData.PublishedAt = publishedAt;
    }
    await courseRepository.updateCourseById(
      courseId,
      courseUpdateData,
      transaction
    );

    await transaction.commit();

    try {
      const course = await courseRepository.findCourseById(courseId); // Lấy lại tên khóa học
      const instructorId = approvalRequest.InstructorID;
      let notifyMessage = '';
      let notifyType = '';
      if (decision === ApprovalStatus.APPROVED) {
        notifyMessage = `Khóa học "${
          course?.CourseName || 'của bạn'
        }" đã được phê duyệt và xuất bản!`;
        notifyType = 'COURSE_APPROVED';
      } else if (decision === ApprovalStatus.REJECTED) {
        notifyMessage = `Khóa học "${
          course?.CourseName || 'của bạn'
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
    return updatedRequest;
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
 * @param {number} courseId
 * @param {boolean} isFeatured
 * @param {object} user - Admin thực hiện.
 * @returns {Promise<object>} - Khóa học đã cập nhật.
 */
const toggleCourseFeature = async (courseId, isFeatured, user) => {
  // Chỉ Admin/SuperAdmin mới được làm việc này (đã check ở route)
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
// /**
//  * So sánh hai object đơn giản (chỉ các trường primitive).
//  * @param {object} objA
//  * @param {object} objB
//  * @param {string[]} keysToCompare - Mảng các key cần so sánh.
//  * @returns {boolean} - True nếu khác nhau, False nếu giống nhau.
//  */
// const hasPrimitiveChanges = (objA, objB, keysToCompare) => {
//   if (!objA || !objB) return true;
//   for (const key of keysToCompare) {
//     const valA = objA[key] ?? null;
//     const valB = objB[key] ?? null;
//     if (valA !== valB) {
//       return true;
//     }
//   }
//   return false;
// };

/**
 * Admin: Lấy danh sách các yêu cầu phê duyệt khóa học.
 * @param {object} filters - { status, instructorId, courseId }
 * @param {object} options - { page, limit, sortBy }
 * @returns {Promise<object>} - { requests, total, page, limit, totalPages }
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
 * @param {number} requestId
 * @returns {Promise<object>}
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

const getCourseStatuses = async () => {
  const statuses = await courseRepository.getAllCourseStatuses();
  return toCamelCaseObject(statuses);
};

/**
 * Query for courses by category slug with pagination and filtering.
 * @param {string} categorySlug
 * @param {object} filterOptions - Options for filtering courses.
 * @param {object} paginationOptions - Options for pagination and sorting.
 * @returns {Promise<QueryResult>}
 */
const queryCoursesByCategorySlug = async (
  categorySlug,
  filterOptions,
  paginationOptions,
  targetCurrency = 'USD'
) => {
  // 1. Tìm CategoryID từ categorySlug
  const category = await categoryRepository.findCategoryBySlug(categorySlug);
  if (!category) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');
  }

  // 2. Thêm categoryId vào filterOptions
  const combinedFilterOptions = {
    ...filterOptions,
    categoryId: category.CategoryID,
    statusId: CourseStatus.PUBLISHED,
  };

  // 3. Gọi hàm queryCourses hiện có (hoặc một hàm tương tự)
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
 * Query for courses by instructor ID with pagination and filtering.
 * @param {number|string} instructorId
 * @param {object} filterOptions - Options for filtering courses.
 * @param {object} paginationOptions - Options for pagination and sorting.
 * @param {object|null} currentUser - Thông tin người dùng hiện tại (nếu có)
 * @returns {Promise<QueryResult>}
 */
const queryCoursesByInstructor = async (
  instructorId,
  filterOptions,
  paginationOptions,
  currentUser = null,
  targetCurrency = 'USD'
) => {
  // 1. Kiểm tra xem instructorId có tồn tại và có phải là giảng viên không
  const instructor = await userRepository.findUserById(instructorId);
  console.log(`Checking instructor with ID ${instructorId}:`, instructor);
  if (
    !instructor ||
    (instructor.RoleID !== Roles.INSTRUCTOR &&
      instructor.RoleID !== Roles.SUPERADMIN)
  ) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Instructor not found');
  }

  // 2. Xử lý quyền xem trạng thái khóa học
  let canViewNonPublished = false;
  if (currentUser) {
    if (
      currentUser.accountId === parseInt(instructorId, 10) ||
      [Roles.ADMIN, Roles.SUPERADMIN].includes(currentUser.roleId)
    ) {
      canViewNonPublished = true;
    }
  }

  let effectiveStatusId = filterOptions.statusId;
  if (!filterOptions.statusId && !canViewNonPublished) {
    effectiveStatusId = CourseStatus.PUBLISHED;
  } else if (!filterOptions.statusId && canViewNonPublished) {
    effectiveStatusId = null;
  }

  const combinedFilterOptions = {
    ...filterOptions,
    instructorId: parseInt(instructorId, 10),
    statusId: effectiveStatusId,
  };

  const coursesResult = await courseRepository.findAllCourses(
    combinedFilterOptions,
    paginationOptions
  );
  for (const course of coursesResult.courses) {
    course.pricing = await pricingUtil.createPricingObject(
      course,
      targetCurrency
    );
  }
  return {
    courses: toCamelCaseObject(coursesResult.courses),
    total: coursesResult.total,
    page: parseInt(paginationOptions.page, 10),
    limit: parseInt(paginationOptions.limit, 10),
    totalPages: Math.ceil(coursesResult.total / paginationOptions.limit),
  };
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

  getCourseStatuses,
  queryCoursesByCategorySlug,
  queryCoursesByInstructor,
};
