// File: src/api/courses/courses.controller.js

const httpStatus = require('http-status').status;
const _ = require('lodash'); // Import lodash để so sánh object (npm install lodash)
const courseRepository = require('./courses.repository');
const categoryRepository = require('../categories/categories.repository'); // Cần để kiểm tra Category tồn tại
const levelRepository = require('../levels/levels.repository'); // Cần để kiểm tra Level tồn tại
const ApiError = require('../../core/errors/ApiError');
const { generateSlug } = require('../../utils/slugify');
const CourseStatus = require('../../core/enums/CourseStatus');
const ApprovalStatus = require('../../core/enums/ApprovalStatus');
const ApprovalRequestType = require('../../core/enums/ApprovalRequestType');
const Roles = require('../../core/enums/Roles');
const logger = require('../../utils/logger');
const sectionRepository = require('../sections/sections.repository'); // *** THÊM IMPORT ***
const lessonRepository = require('../lessons/lessons.repository');
const cloudinaryUtil = require('../../utils/cloudinary.util');
const enrollmentService = require('../enrollments/enrollments.service');
const notificationService = require('../notifications/notifications.service');
const progressService = require('../progress/progress.service'); // Import progress service statically
const lessonAttachmentRepository = require('../lessons/lessonAttachment.repository'); // Import lesson attachment repository
const { getConnection, sql } = require('../../database/connection');
const progressData = require('../progress/progress.service'); // Import progress data for user progress
const authRepository = require('../auth/auth.repository'); // Để lấy danh sách admin/superadmin
const { checkCourseAccess } = require('../sections/sections.service');
const languageRepository = require('../languages/languages.repository');
const quizRepository = require('../quizzes/quizzes.repository');
const attachmentRepository = require('../lessons/lessonAttachment.repository');
const subtitleRepository = require('../lessons/subtitle.repository');
const { toCamelCaseObject } = require('../../utils/caseConverter');
const userRepository = require('../users/users.repository');
/**
 * Tạo khóa học mới (bởi Instructor).
 * @param {object} courseData - Dữ liệu từ request body.
 * @param {number} instructorId - ID của giảng viên tạo khóa học (từ req.user).
 * @returns {Promise<object>} - Khóa học mới được tạo (trạng thái DRAFT).
 */
const createCourse = async (courseData, instructorId) => {
  const {
    courseName,
    categoryId,
    levelId,
    language,
    // Các trường khác: shortDescription, fullDescription, price,...
    ...otherData
  } = courseData;

  // 1. Kiểm tra Category và Level tồn tại

  const category = await categoryRepository.findCategoryById(categoryId);
  if (!category) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Danh mục không hợp lệ.');
  }
  const level = await levelRepository.findLevelById(levelId);
  if (!level) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cấp độ không hợp lệ.');
  }

  // *** Kiểm tra Language hợp lệ ***
  if (language) {
    const langExists = await languageRepository.findLanguageByCode(language);
    if (!langExists || !langExists.IsActive) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Ngôn ngữ '${language}' không hợp lệ hoặc không được kích hoạt.`
      );
    }
  } else {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Ngôn ngữ khóa học là bắt buộc.'
    ); // Hoặc gán mặc định nếu có
  }

  // 2. Tạo slug từ tên khóa học
  let slug = generateSlug(courseName);
  const existingSlug = await courseRepository.findCourseIdBySlug(slug);
  if (existingSlug) {
    slug = `${slug}-${Math.random().toString(36).substring(2, 7)}`; // Thêm hậu tố nếu trùng
  }

  // 3. Tạo khóa học với trạng thái DRAFT
  const newCourseData = {
    CourseName: courseName,
    Slug: slug,
    ShortDescription: otherData.shortDescription || '', // NOT NULL
    FullDescription: otherData.fullDescription || '', // NOT NULL
    Requirements: otherData.requirements || null,
    LearningOutcomes: otherData.learningOutcomes || null,
    ThumbnailUrl: otherData.thumbnailUrl || null,
    IntroVideoUrl: otherData.introVideoUrl || null,
    OriginalPrice: otherData.originalPrice || 0, // CHECK (OriginalPrice >= 0)
    DiscountedPrice: otherData.discountedPrice || null, // CHECK (DiscountedPrice >= 0)
    InstructorID: instructorId,
    CategoryID: categoryId,
    LevelID: levelId,
    Language: language,
    StatusID: CourseStatus.DRAFT, // Default to DRAFT when created by instructor
    PublishedAt: null, // Not published yet
    IsFeatured: false, // Default to not featured
    AverageRating: 0, // Default rating
    ReviewCount: 0, // Default review count
  };

  const createdCourse = await courseRepository.createCourse(newCourseData);
  return toCamelCaseObject(createdCourse);
};

/**
 * Lấy danh sách khóa học (có thể lọc theo nhiều tiêu chí).
 * Dùng cho cả public, instructor và admin, quyền xem dữ liệu được kiểm soát ở repository/service.
 * @param {object} filters - Bộ lọc (categoryId, levelId, instructorId, statusId, searchTerm,...).
 * @param {object} options - Phân trang và sắp xếp (page, limit, sortBy).
 * @param {object|null} user - Thông tin user đang đăng nhập (nếu có).
 * @returns {Promise<object>} - { courses, total, page, limit, totalPages }.
 */
const getCourses = async (filters = {}, options = {}, user = null) => {
  const effectiveFilters = { ...filters };

  // Logic phân quyền xem dữ liệu:
  if (user) {
    if (user.role === Roles.INSTRUCTOR && effectiveFilters.userPage === false) {
      // Giảng viên chỉ xem được khóa học của mình và các khóa học PUBLISHED
      // Nếu filter instructorId khác với user.id => lỗi hoặc chỉ trả về published
      if (
        effectiveFilters.instructorId &&
        effectiveFilters.instructorId !== user.id
      ) {
        logger.warn(
          `Instructor ${user.id} trying to filter courses by another instructor ${effectiveFilters.instructorId}. Returning only published courses.`
        );
        effectiveFilters.instructorId = null; // Reset filter instructor
        effectiveFilters.statusId = CourseStatus.PUBLISHED; // Chỉ xem published
      } else {
        // Nếu không filter instructorId hoặc filter chính mình
        effectiveFilters.instructorId = user.id; // Mặc định xem của mình
        effectiveFilters.statusId = filters.statusId || 'ALL'; // Cho phép instructor xem mọi status của họ
      }
    } else if (
      (user.role === Roles.ADMIN || user.role === Roles.SUPERADMIN) &&
      effectiveFilters.userPage === false
    ) {
      // Admin/SuperAdmin có thể xem mọi status nếu muốn
      effectiveFilters.statusId = filters.statusId || 'ALL'; // Cho phép xem tất cả nếu không chỉ định
    } else if (
      user.role === Roles.STUDENT ||
      effectiveFilters.userPage === true
    ) {
      // STUDENT hoặc role khác chỉ xem được PUBLISHED
      effectiveFilters.statusId = CourseStatus.PUBLISHED;
    }
  } else {
    // Người dùng chưa đăng nhập chỉ xem được PUBLISHED
    effectiveFilters.statusId = CourseStatus.PUBLISHED;
  }

  console.log('effectiveFilters', effectiveFilters);

  const { page = 1, limit = 10 } = options;
  const result = await courseRepository.findAllCourses(
    effectiveFilters,
    options
  );
  console.log('result', result);
  return {
    courses: toCamelCaseObject(result.courses), // Chuyển đổi sang camelCase nếu cần
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
const getCourseBySlug = async (slug, user = null) => {
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
      // Bỏ qua lỗi này, coi như chưa đăng ký
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
          // Xóa các trường không cần thiết trả về client (ví dụ: ExternalVideoID của Cloudinary)
          if (lesson.VideoSourceType === 'CLOUDINARY') {
            lesson.ExternalVideoID = lesson.ExternalVideoID ? 'uploaded' : null; // Thay thế bằng trạng thái "uploaded" nếu đã upload
          }
          // Xóa đáp án đúng của Quiz nếu user không phải owner/admin
          if (!isAdmin && !isOwnerInstructor && lesson.questions) {
            lesson.questions.forEach((q) => {
              q.options?.forEach((o) => delete o.IsCorrectAnswer);
              // Có thể xóa cả Explanation nếu muốn
              // delete q.Explanation;
            });
          }
        });
      }
    });
  }

  // Thêm thông tin isEnrolled và userProgress (nếu có)
  // course.isEnrolled = canViewFullContent || lesson.IsFreePreview; // Nếu có thể xem full content thì coi như enrolled (cho mục đích hiển thị)
  course.isEnrolled = canViewFullContent;
  if (user && course.isEnrolled) {
    // Chỉ lấy progress nếu user đã enroll (hoặc là owner/admin)
    try {
      // Hàm này nên được tối ưu để không query DB nhiều lần nếu được gọi liên tục
      const progressData = await progressService.getCourseProgress(
        user.id,
        course.CourseID
      );
      // Tạo map progress để FE dễ tra cứu
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
      course.userProgress = {}; // Đặt là object rỗng nếu có lỗi hoặc chưa enroll
    }
  } else {
    course.userProgress = {};
  }

  return toCamelCaseObject(course); // Chuyển đổi sang camelCase nếu cần
};

/**
 * Cập nhật khóa học (bởi Instructor hoặc Admin).
 * @param {number} courseId
 * @param {object} updateBody - Dữ liệu cập nhật.
 * @param {object} user - Người dùng thực hiện (để kiểm tra quyền).
 * @returns {Promise<object>} - Khóa học đã cập nhật.
 */
const updateCourse = async (courseId, updateBody, user) => {
  const course = await courseRepository.findCourseById(courseId, true); // Lấy cả draft
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
    delete updateBody.instructorId; // Hoặc throw lỗi
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
      dataToUpdate.Language = updateBody.language; // dataToUpdate là object chứa các field sẽ update
    }

    const updatedCourse = await courseRepository.updateCourseById(
      courseId,
      dataToUpdate,
      transaction
    );
    if (!updatedCourse) {
      // Có thể do không có gì thay đổi hoặc lỗi không mong muốn
      logger.warn(
        `Update course ${courseId} returned null. Body: ${JSON.stringify(
          updateBody
        )}`
      );
      // Trả về khóa học gốc nếu không có gì thay đổi
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

    // Rollback transaction nếu có lỗi
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
  const course = await courseRepository.findCourseById(courseId, true); // Lấy cả draft để xóa
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

  // TODO: Xóa tất cả các tài nguyên liên quan trên Cloudinary TRƯỚC KHI xóa DB
  // 1. Xóa Thumbnail khóa học
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
      // Có thể quyết định dừng lại hoặc tiếp tục xóa DB
    }
  }

  // 2. Lấy tất cả lessons của khóa học để xóa video và attachments
  const sections = await sectionRepository.findSectionsByCourseId(courseId);

  for (const section of sections) {
    const lessons = await lessonRepository.findLessonsBySectionId(
      section.SectionID
    );

    for (const lesson of lessons) {
      // Xóa video của lesson
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
  // Giảng viên chỉ được xóa khi khóa học là DRAFT hoặc REJECTED? (Tùy quy định)
  // if (isOwnerInstructor && ![CourseStatus.DRAFT, CourseStatus.REJECTED].includes(course.StatusID)) {
  //     throw new ApiError(httpStatus.BAD_REQUEST, 'Bạn chỉ có thể xóa khóa học nháp hoặc bị từ chối.');
  // }

  // Thực hiện xóa (hiện tại là xóa cứng)
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
      // Không nên chặn upload nếu xóa lỗi, chỉ ghi log
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
      folder: `courses/${courseId}/thumbnails`, // Tổ chức theo thư mục
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
    // Rollback: Xóa file vừa upload lên Cloudinary
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

  return toCamelCaseObject(updatedCourse); // Trả về khóa học đã cập nhật
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

  // Kiểm tra quyền (tương tự updateCourseThumbnail)
  const isAdmin = user.role === Roles.ADMIN || user.role === Roles.SUPERADMIN;
  const isOwnerInstructor =
    user.role === Roles.INSTRUCTOR && course.InstructorID === user.id;
  if (!isAdmin && !isOwnerInstructor) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn không có quyền cập nhật khóa học này.'
    );
  }
  // Chỉ cho phép sửa khi là DRAFT hoặc REJECTED? (Tùy quy định)
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

  // Xóa video intro cũ trên Cloudinary nếu có (Cần có public_id cũ - Vấn đề!)
  // Nếu chỉ lưu URL công khai, việc xóa file cũ sẽ khó khăn nếu không lưu public_id.
  // --> Giải pháp tạm thời: Không xóa file cũ tự động, chỉ ghi đè URL mới.
  // --> Giải pháp tốt hơn: Thêm cột IntroVideoPublicId như đã làm với Thumbnail.

  if (course.IntroVideoPublicId) {
    // Nếu quyết định thêm cột này
    try {
      await cloudinaryUtil.deleteAsset(course.IntroVideoPublicId, {
        resource_type: 'video',
        type: 'upload',
      }); // Giả sử type là 'upload'
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
      type: 'upload', // *** Upload dạng public ***
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
    IntroVideoUrl: uploadResult.secure_url, // *** Lưu secure_url công khai ***
    IntroVideoPublicId: uploadResult.public_id, // *** Lưu nếu có cột này ***
  };
  const updatedCourse = await courseRepository.updateCourseById(
    courseId,
    updateData
  );

  if (!updatedCourse) {
    // Lỗi cập nhật DB -> Cân nhắc xóa file vừa upload?
    logger.error(
      `Failed to update course ${courseId} in DB after intro video upload. Uploaded public_id: ${uploadResult.public_id}`
    );
    // await cloudinaryUtil.deleteAsset(uploadResult.public_id, { resource_type: 'video', type: 'upload' });
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

  // TODO: Gửi thông báo cho Admin
  try {
    const course = await courseRepository.findCourseById(courseId, true); // Lấy tên khóa học
    const message = `Giảng viên ${
      user.fullName || user.email
    } vừa gửi yêu cầu duyệt cho khóa học "${course?.CourseName || 'mới'}".`;
    // Lấy danh sách Admin/SuperAdmin (cần hàm mới trong userRepository/authRepository)
    const adminIds = await authRepository.findAccountIdsByRoles([
      Roles.ADMIN,
      Roles.SUPERADMIN,
    ]);
    adminIds.forEach((adminId) => {
      notificationService.createNotification(
        adminId,
        'COURSE_SUBMITTED', // Loại thông báo mới
        message,
        { type: 'CourseApprovalRequest', id: approvalRequest.RequestID } // Liên kết đến request
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
  console.log('Review course approval:', requestId, decision, user, adminNotes); // Debug log
  const approvalRequest =
    await courseRepository.findCourseApprovalRequestById(requestId); // Cần sửa lại hàm này hoặc tạo hàm find by ID
  // ---- TẠM THỜI: Giả sử có hàm findApprovalRequestById(requestId) ----
  // const approvalRequest = await courseRepository.findApprovalRequestById(requestId);

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
    publishedAt = new Date(); // Gán thời gian publish
  } else if (decision === ApprovalStatus.REJECTED) {
    newCourseStatus = CourseStatus.REJECTED;
  } else if (decision === ApprovalStatus.NEEDS_REVISION) {
    // Có thể giữ status PENDING hoặc đổi thành status khác? Tạm thời REJECTED
    newCourseStatus = CourseStatus.REJECTED; // Hoặc tạo status NEEDS_REVISION
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
    ); // Truyền transaction vào repo

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

    // TODO: Gửi thông báo cho Giảng viên
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
      // Thêm trường hợp NEEDS_REVISION nếu có

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
    return updatedRequest; // Trả về request đã cập nhật
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
  const course = await courseRepository.findCourseById(courseId, true); // Lấy cả draft
  if (!course) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy khóa học.');
  }

  // Chỉ nên feature khóa học đã published? (Tùy quy định)
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
    return course; // Trả về trạng thái hiện tại nếu không đổi
  }
  logger.info(
    `Admin ${user.id} set IsFeatured=${isFeatured} for course ${courseId}`
  );
  return updatedCourse;
};
/**
 * So sánh hai object đơn giản (chỉ các trường primitive).
 * @param {object} objA
 * @param {object} objB
 * @param {string[]} keysToCompare - Mảng các key cần so sánh.
 * @returns {boolean} - True nếu khác nhau, False nếu giống nhau.
 */
const hasPrimitiveChanges = (objA, objB, keysToCompare) => {
  if (!objA || !objB) return true; // Coi như khác nếu một trong hai không tồn tại
  for (const key of keysToCompare) {
    const valA = objA[key] ?? null; // Coi undefined là null
    const valB = objB[key] ?? null; // Coi undefined là null
    if (valA !== valB) {
      // logger.trace(`Change detected in key "${key}": FROM ${valA} TO ${valB}`); // Log chi tiết nếu cần debug
      return true;
    }
  }
  return false;
};

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
  // Có thể xử lý thêm dữ liệu ở đây nếu cần
  return toCamelCaseObject(requestDetails);
};

// /**
//  * Admin: Lấy danh sách khóa học đang chờ duyệt.
//  * @param {object} options - { page, limit, sortBy }
//  * @returns {Promise<object>} - { courses, total, page, limit, totalPages }
//  */
// const getPendingCourses = async (options = {}) => {
//   const { page = 1, limit = 10, sortBy } = options;
//   const result = await courseRepository.findPendingCoursesForAdmin({
//     page,
//     limit,
//     sortBy,
//   });
//   return {
//     courses: result.courses,
//     total: result.total,
//     page: parseInt(page, 10),
//     limit: parseInt(limit, 10),
//     totalPages: Math.ceil(result.total / limit),
//   };
// };

/** => không còn cần thiết nữa
 * Đồng bộ hóa toàn bộ cấu trúc curriculum (sections, lessons, questions, etc.) của khóa học.
 * Thực hiện các thao tác Create, Update, Delete cần thiết trong một transaction.
 * @param {number} courseId - ID của khóa học.
 * @param {Array<object>} sectionsPayload - Mảng sections từ frontend (đã được sắp xếp).
 * @param {object} user - User thực hiện (để kiểm tra quyền).
 * @returns {Promise<void>}
 */
const syncCurriculum = async (courseId, sectionsPayload, user) => {
  logger.info(
    `[Sync Curriculum] Start for course ${courseId} by user ${user.id}`
  );
  await checkCourseAccess(courseId, user, 'synchronize curriculum');

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);

  const cloudFilesToDelete = [];

  try {
    await transaction.begin();
    logger.debug(
      `[Sync Curriculum] Transaction started for course ${courseId}.`
    );

    // --- Step 1 & 2: Fetch Current State & Prepare Maps ---
    logger.debug(`[Sync Curriculum] Fetching current curriculum...`);
    // !!! Giả định hàm này trả về cấu trúc lồng nhau ĐẦY ĐỦ !!!
    const currentSections = await sectionRepository.findAllSectionsWithDetails(
      courseId,
      null
    );
    const currentSectionsMap = new Map(
      currentSections.map((s) => [s.SectionID, s])
    );
    // Tạo map cho tất cả các entities con để tra cứu nhanh
    const currentLessonsMap = new Map();
    const currentQuestionsMap = new Map();
    const currentOptionsMap = new Map();
    const currentAttachmentsMap = new Map();
    const currentSubtitlesMap = new Map();
    currentSections.forEach((s) =>
      s.lessons?.forEach((l) => {
        currentLessonsMap.set(l.LessonID, l);
        l.questions?.forEach((q) => {
          currentQuestionsMap.set(q.QuestionID, q);
          q.options?.forEach((o) => currentOptionsMap.set(o.OptionID, o));
        });
        l.attachments?.forEach((a) =>
          currentAttachmentsMap.set(a.AttachmentID, a)
        );
        l.subtitles?.forEach((sub) =>
          currentSubtitlesMap.set(sub.SubtitleID, sub)
        );
      })
    );
    logger.debug(
      `[Sync Curriculum] Fetched ${currentSections.length} sections, ${currentLessonsMap.size} lessons, ...`
    );

    // --- Step 3: Diffing and Scheduling CUD Operations ---
    logger.debug(`[Sync Curriculum] Calculating diff and scheduling CUD...`);
    const sectionIdsInPayload = new Set(); // Sử dụng Set cho ID thật
    const lessonIdsInPayload = new Set();
    const questionIdsInPayload = new Set();
    const optionIdsInPayload = new Set();
    const attachmentIdsInPayload = new Set();
    const subtitleIdsInPayload = new Set();

    const sectionsToCreate = [];
    const sectionsToUpdate = [];
    const lessonsToCreate = [];
    const lessonsToUpdate = [];
    const questionsToCreate = [];
    const questionsToUpdate = [];
    const optionsToCreate = [];
    const optionsToUpdate = [];
    const attachmentsToCreate = [];
    const subtitlesToCreate = [];
    const subtitlesToUpdate = []; // Thêm mảng update cho subtitle

    const optionsToDelete = [];
    const questionsToDelete = [];
    const attachmentsToDelete = [];
    const subtitlesToDelete = [];
    const lessonsToDelete = [];
    const sectionsToDelete = [];

    const tempToRealSectionIdMap = new Map();
    const tempToRealLessonIdMap = new Map();
    const tempToRealQuestionIdMap = new Map();
    // Không cần map cho option, attachment, subtitle vì chúng thường không có con

    // --- Process Sections from Payload ---
    for (const [index, sectionPayload] of sectionsPayload.entries()) {
      sectionPayload.sectionOrder = index;
      const sectionId = sectionPayload.id;
      const sectionTempId = sectionPayload.tempId; // Lấy tempId
      if (sectionId) sectionIdsInPayload.add(sectionId);
      const existingSection = sectionId
        ? currentSectionsMap.get(sectionId)
        : null;

      if (existingSection) {
        // --- Section Exists: Check for Updates ---
        const sectionUpdateData = {
          SectionName: sectionPayload.sectionName,
          Description: sectionPayload.description || null,
          SectionOrder: sectionPayload.sectionOrder,
        };
        if (
          hasPrimitiveChanges(existingSection, sectionUpdateData, [
            'SectionName',
            'Description',
            'SectionOrder',
          ])
        ) {
          sectionsToUpdate.push({ id: sectionId, data: sectionUpdateData });
        }

        // --- Process Lessons within Existing Section ---
        const existingLessonsMap = new Map(
          existingSection.lessons?.map((l) => [l.LessonID, l])
        );
        for (const [lessonIndex, lessonPayload] of (
          sectionPayload.lessons || []
        ).entries()) {
          lessonPayload.lessonOrder = lessonIndex;
          const lessonId = lessonPayload.id;
          const lessonTempId = lessonPayload.tempId;
          if (lessonId) lessonIdsInPayload.add(lessonId);
          const existingLesson = lessonId
            ? existingLessonsMap.get(lessonId)
            : null;

          if (existingLesson) {
            // --- Lesson Exists: Check for Updates ---
            const lessonUpdateData = {
              // Chỉ bao gồm các trường có thể update qua API này
              LessonName: lessonPayload.lessonName,
              Description: lessonPayload.description || null,
              LessonOrder: lessonPayload.lessonOrder,
              LessonType: lessonPayload.lessonType,
              IsFreePreview: lessonPayload.isFreePreview || false, // Đảm bảo có default
              VideoSourceType: lessonPayload.videoSourceType || null,
              ExternalVideoID:
                (lessonPayload.videoSourceType !== 'CLOUDINARY'
                  ? lessonPayload.externalVideoInput
                  : existingLesson.ExternalVideoID) || null,
              TextContent: lessonPayload.textContent || null,
              // Không update videoDuration, thumbnailUrl ở đây (có thể update riêng nếu cần)
            };
            if (
              hasPrimitiveChanges(
                existingLesson,
                lessonUpdateData,
                Object.keys(lessonUpdateData)
              )
            ) {
              lessonsToUpdate.push({ id: lessonId, data: lessonUpdateData });
            }

            // --- Process Questions within Existing Lesson ---
            const existingQuestionsMap = new Map(
              existingLesson.questions?.map((q) => [q.QuestionID, q])
            );
            const payloadQuestionIdsInSection = new Set(); // Track IDs trong lesson payload này
            for (const [qIndex, qPayload] of (
              lessonPayload.questions || []
            ).entries()) {
              qPayload.questionOrder = qIndex;
              const questionId = qPayload.id;
              const questionTempId = qPayload.tempId;
              if (questionId) {
                payloadQuestionIdsInSection.add(questionId);
                questionIdsInPayload.add(questionId);
              }
              const existingQuestion = questionId
                ? existingQuestionsMap.get(questionId)
                : null;

              if (existingQuestion) {
                // --- Question Exists: Check Update ---
                const qUpdateData = {
                  QuestionText: qPayload.questionText,
                  Explanation: qPayload.explanation || null,
                  QuestionOrder: qPayload.questionOrder,
                };
                if (
                  hasPrimitiveChanges(existingQuestion, qUpdateData, [
                    'QuestionText',
                    'Explanation',
                    'QuestionOrder',
                  ])
                ) {
                  questionsToUpdate.push({ id: questionId, data: qUpdateData });
                }
                // --- Diff Options ---
                const existingOptionsMap = new Map(
                  existingQuestion.options?.map((o) => [o.OptionID, o])
                );
                const payloadOptionIdsInQuestion = new Set();
                for (const [oIndex, oPayload] of (
                  qPayload.options || []
                ).entries()) {
                  oPayload.optionOrder = oIndex;
                  const optionId = oPayload.id;
                  if (optionId) {
                    payloadOptionIdsInQuestion.add(optionId);
                    optionIdsInPayload.add(optionId);
                  }
                  const existingOption = optionId
                    ? existingOptionsMap.get(optionId)
                    : null;
                  if (existingOption) {
                    // Option Update
                    const oUpdateData = {
                      OptionText: oPayload.optionText,
                      IsCorrectAnswer: oPayload.isCorrectAnswer || false,
                      OptionOrder: oPayload.optionOrder,
                    };
                    if (
                      hasPrimitiveChanges(existingOption, oUpdateData, [
                        'OptionText',
                        'IsCorrectAnswer',
                        'OptionOrder',
                      ])
                    ) {
                      optionsToUpdate.push({ id: optionId, data: oUpdateData });
                    }
                  } else {
                    // Option Create
                    optionsToCreate.push({
                      questionId,
                      optionPayload: oPayload,
                    });
                  }
                }
                existingQuestion.options?.forEach((eo) => {
                  if (
                    eo.OptionID &&
                    !payloadOptionIdsInQuestion.has(eo.OptionID)
                  )
                    optionsToDelete.push(eo.OptionID);
                });
              } else {
                // --- CREATE Question ---
                questionsToCreate.push({
                  lessonId,
                  questionData: qPayload,
                });
              }
            } // End loop questionPayload
            existingLesson.questions?.forEach((eq) => {
              if (
                eq.QuestionID &&
                !payloadQuestionIdsInSection.has(eq.QuestionID)
              )
                questionsToDelete.push(eq.QuestionID);
            });

            // --- Process Attachments ---
            const existingAttachmentsMap = new Map(
              existingLesson.attachments?.map((a) => [a.AttachmentID, a])
            );
            const payloadAttachmentIdsInSection = new Set();
            (lessonPayload.attachments || []).forEach((aPayload) => {
              const attachId = aPayload.id;
              if (attachId) {
                payloadAttachmentIdsInSection.add(attachId);
                attachmentIdsInPayload.add(attachId);
              }
              const existingAttach = attachId
                ? existingAttachmentsMap.get(attachId)
                : null;
              if (!existingAttach) {
                // CREATE Attachment (Metadata only)
                const { file, ...metaData } = aPayload; // Bỏ file object
                attachmentsToCreate.push({
                  lessonId,
                  attachmentData: metaData,
                });
              }
              // Không có logic update attachment metadata ở đây
            });
            existingLesson.attachments?.forEach((ea) => {
              if (
                ea.AttachmentID &&
                !payloadAttachmentIdsInSection.has(ea.AttachmentID)
              )
                attachmentsToDelete.push(ea.AttachmentID);
            });

            // --- Process Subtitles ---
            const existingSubtitlesMap = new Map(
              existingLesson.subtitles?.map((s) => [s.SubtitleID, s])
            );
            const payloadSubtitleIdsInSection = new Set();
            (lessonPayload.subtitles || []).forEach((sPayload) => {
              const subId = sPayload.id;
              if (subId) {
                payloadSubtitleIdsInSection.add(subId);
                subtitleIdsInPayload.add(subId);
              }
              const existingSub = subId
                ? existingSubtitlesMap.get(subId)
                : null;
              if (existingSub) {
                // UPDATE Subtitle
                const subUpdateData = {
                  LanguageCode: sPayload.languageCode,
                  LanguageName: sPayload.languageName,
                  SubtitleUrl: sPayload.subtitleUrl,
                  IsDefault: sPayload.isDefault || false,
                };
                if (
                  hasPrimitiveChanges(existingSub, subUpdateData, [
                    'LanguageCode',
                    'LanguageName',
                    'SubtitleUrl',
                    'IsDefault',
                  ])
                ) {
                  subtitlesToUpdate.push({ id: subId, data: subUpdateData });
                }
              } else {
                // CREATE Subtitle
                subtitlesToCreate.push({
                  lessonId,
                  subtitleData: sPayload,
                });
              }
            });
            existingLesson.subtitles?.forEach((es) => {
              if (
                es.SubtitleID &&
                !payloadSubtitleIdsInSection.has(es.SubtitleID)
              )
                subtitlesToDelete.push(es.SubtitleID);
            });
          } else {
            // --- CREATE LESSON ---
            lessonsToCreate.push({
              sectionId,
              lessonPayload,
            });
          }
        } // End loop lessons

        // Check Lessons to Delete in this section
        existingSection.lessons?.forEach((existingL) => {
          let found = false;
          for (const lp of sectionPayload.lessons || []) {
            if (lp.id === existingL.LessonID) {
              found = true;
              break;
            }
          }
          if (!found && existingL.LessonID)
            lessonsToDelete.push(existingL.LessonID);
        });
      } else {
        // --- CREATE SECTION ---
        sectionsToCreate.push({ ...sectionPayload, courseId });
      }
    } // End loop sections

    // --- Identify Sections to Delete ---
    currentSectionsMap.forEach((existingSection, sectionId) => {
      if (!sectionIdsInPayload.has(sectionId)) {
        sectionsToDelete.push(sectionId);
        // Add children to delete lists if not using CASCADE
        existingSection.lessons?.forEach((l) => {
          lessonsToDelete.push(l.LessonID); // Add lesson to delete list
          l.questions?.forEach((q) => {
            questionsToDelete.push(q.QuestionID);
            q.options?.forEach((o) => optionsToDelete.push(o.OptionID));
          });
          l.attachments?.forEach((a) =>
            attachmentsToDelete.push(a.AttachmentID)
          );
          l.subtitles?.forEach((s) => subtitlesToDelete.push(s.SubtitleID));
        });
      }
    });
    // Identify children of lessons marked for deletion
    lessonsToDelete.forEach((lId) => {
      const existingLesson = currentLessonsMap.get(lId);
      if (existingLesson) {
        existingLesson.questions?.forEach((q) => {
          questionsToDelete.push(q.QuestionID);
          q.options?.forEach((o) => optionsToDelete.push(o.OptionID));
        });
        existingLesson.attachments?.forEach((a) =>
          attachmentsToDelete.push(a.AttachmentID)
        );
        existingLesson.subtitles?.forEach((s) =>
          subtitlesToDelete.push(s.SubtitleID)
        );
      }
    });
    // Identify children of questions marked for deletion
    questionsToDelete.forEach((qId) => {
      const existingQuestion = currentQuestionsMap.get(qId);
      existingQuestion?.options?.forEach((o) =>
        optionsToDelete.push(o.OptionID)
      );
    });
    // Remove duplicates from delete lists
    const uniqueOptionsToDelete = [...new Set(optionsToDelete)];
    const uniqueQuestionsToDelete = [...new Set(questionsToDelete)];
    const uniqueAttachmentsToDelete = [...new Set(attachmentsToDelete)];
    const uniqueSubtitlesToDelete = [...new Set(subtitlesToDelete)];
    const uniqueLessonsToDelete = [...new Set(lessonsToDelete)];
    const uniqueSectionsToDelete = [...new Set(sectionsToDelete)];

    // --- Step 4: Execute CUD Operations in Transaction ---
    logger.debug(`[Sync Curriculum] Executing CUD...`);

    // 4.1. DELETES (Reverse Order)
    if (uniqueOptionsToDelete.length > 0)
      await quizRepository.deleteOptionsByIds(
        uniqueOptionsToDelete,
        transaction
      );
    if (uniqueQuestionsToDelete.length > 0)
      await quizRepository.deleteQuestionsByIds(
        uniqueQuestionsToDelete,
        transaction
      );
    if (uniqueAttachmentsToDelete.length > 0) {
      const deletedAttachInfo =
        await attachmentRepository.deleteAttachmentsByIds(
          uniqueAttachmentsToDelete,
          transaction
        );
      cloudFilesToDelete.push(
        ...(deletedAttachInfo?.filesToDelete?.map((f) => ({
          publicId: f.CloudStorageID,
          resourceType: 'raw',
        })) || [])
      );
    }
    if (uniqueSubtitlesToDelete.length > 0)
      await subtitleRepository.deleteSubtitlesByIds(
        uniqueSubtitlesToDelete,
        transaction
      ); // TODO: Handle cloud file deletion
    if (uniqueLessonsToDelete.length > 0) {
      // TODO: Get Cloud IDs for lesson videos/attachments before deleting from DB
      const lessonsDataToDelete = uniqueLessonsToDelete
        .map((id) => currentLessonsMap.get(id))
        .filter(Boolean);
      lessonsDataToDelete.forEach((l) => {
        if (l.VideoSourceType === 'CLOUDINARY' && l.ExternalVideoID)
          cloudFilesToDelete.push({
            publicId: l.ExternalVideoID,
            resourceType: 'video',
          });
        l.attachments?.forEach((a) => {
          if (a.CloudStorageID)
            cloudFilesToDelete.push({
              publicId: a.CloudStorageID,
              resourceType: 'raw',
            });
        });
        // Add subtitle cloud file deletion if needed
      });
      await lessonRepository.deleteLessonsByIds(
        uniqueLessonsToDelete,
        transaction
      );
    }
    if (uniqueSectionsToDelete.length > 0) {
      // TODO: Get Cloud IDs for everything inside deleted sections
      uniqueSectionsToDelete.forEach((sId) => {
        const section = currentSectionsMap.get(sId);
        section?.lessons?.forEach((l) => {
          if (l.VideoSourceType === 'CLOUDINARY' && l.ExternalVideoID)
            cloudFilesToDelete.push({
              publicId: l.ExternalVideoID,
              resourceType: 'video',
            });
          l.attachments?.forEach((a) => {
            if (a.CloudStorageID)
              cloudFilesToDelete.push({
                publicId: a.CloudStorageID,
                resourceType: 'raw',
              });
          });
          // Add subtitle cloud file deletion if needed
        });
      });
      await sectionRepository.deleteSectionsByIds(
        uniqueSectionsToDelete,
        transaction
      );
    }

    // 4.2. UPDATES
    for (const sUpdate of sectionsToUpdate)
      await sectionRepository.updateSectionById(
        sUpdate.id,
        sUpdate.data,
        transaction
      );
    for (const lUpdate of lessonsToUpdate)
      await lessonRepository.updateLessonById(
        lUpdate.id,
        lUpdate.data,
        transaction
      );
    for (const qUpdate of questionsToUpdate)
      await quizRepository.updateQuestionById(
        qUpdate.id,
        qUpdate.data,
        transaction
      );
    if (optionsToUpdate.length > 0)
      await quizRepository.updateOptionsBatch(optionsToUpdate, transaction);
    if (subtitlesToUpdate.length > 0)
      await subtitleRepository.updateSubtitlesBatch(
        subtitlesToUpdate,
        transaction
      );

    // 4.3. CREATES (Handle Dependencies and Map IDs)
    for (const sCreatePayload of sectionsToCreate) {
      const { tempId } = sCreatePayload; // Lấy tempId
      const lessonsPayload = sCreatePayload.lessons; // Lấy lessons từ payload
      const sectionData = {
        CourseID: sCreatePayload.courseId,
        SectionName: sCreatePayload.sectionName,
        Description: sCreatePayload.description || null,
        SectionOrder: sCreatePayload.sectionOrder,
      };
      sectionData.CourseID = courseId; // Gán courseId
      const newSection = await sectionRepository.createSection(
        sectionData,
        transaction
      );
      if (tempId) tempToRealSectionIdMap.set(tempId, newSection.SectionID);
      logger.debug(
        `  Created Section ${newSection.SectionID} (tempId: ${tempId})`
      );
      (lessonsPayload || []).forEach((lp) =>
        lessonsToCreate.push({
          sectionId: newSection.SectionID,
          lessonPayload: lp,
        })
      );
    }

    for (const lCreate of lessonsToCreate) {
      const finalSectionId =
        typeof lCreate.sectionId === 'number'
          ? lCreate.sectionId
          : tempToRealSectionIdMap.get(lCreate.sectionId);
      if (!finalSectionId) {
        logger.error(
          `Missing real SectionID for lesson: ${lCreate.lessonPayload.lessonName}`
        );
        continue;
      }
      const {
        tempId,
        questions: questionsPayload,
        attachments: attachmentsPayload,
        subtitles: subtitlesPayload,
        lessonVideo,
        ...lessonData
      } = lCreate.lessonPayload;
      lessonData.SectionID = finalSectionId;
      const newLesson = await lessonRepository.createLesson(
        lessonData,
        transaction
      );
      if (tempId) tempToRealLessonIdMap.set(tempId, newLesson.LessonID);
      logger.debug(
        `    Created Lesson ${newLesson.LessonID} (tempId: ${tempId}) in Section ${finalSectionId}`
      );

      (questionsPayload || []).forEach((qp, qIndex) => {
        qp.questionOrder = qIndex;
        questionsToCreate.push({
          lessonId: newLesson.LessonID,
          questionData: qp,
        });
      });
      (attachmentsPayload || []).forEach((ap) => {
        const { file, ...metaData } = ap;
        attachmentsToCreate.push({
          lessonId: newLesson.LessonID,
          attachmentData: metaData,
        });
      });
      (subtitlesPayload || []).forEach((sp) =>
        subtitlesToCreate.push({
          lessonId: newLesson.LessonID,
          subtitleData: sp,
        })
      );
    }

    for (const qCreate of questionsToCreate) {
      const finalLessonId =
        typeof qCreate.lessonId === 'number'
          ? qCreate.lessonId
          : tempToRealLessonIdMap.get(qCreate.lessonId);
      if (!finalLessonId) {
        logger.error(
          `Missing real LessonID for question: ${qCreate.questionData.questionText}`
        );
        continue;
      }
      const {
        tempId,
        options: optionsPayload,
        ...questionData
      } = qCreate.questionData;
      questionData.LessonID = finalLessonId;
      const newQuestion = await quizRepository.createQuestion(
        questionData,
        transaction
      );
      if (tempId) tempToRealQuestionIdMap.set(tempId, newQuestion.QuestionID);
      logger.debug(
        `      Created Question ${newQuestion.QuestionID} (tempId: ${tempId}) in Lesson ${finalLessonId}`
      );
      if (optionsPayload && optionsPayload.length > 0) {
        const optionsWithRealQId = optionsPayload.map((opt, oIndex) => ({
          QuestionID: newQuestion.QuestionID,
          OptionText: opt.optionText,
          IsCorrectAnswer: opt.isCorrectAnswer || false,
          OptionOrder: oIndex,
        }));
        await quizRepository.insertOptionsBatch(
          optionsWithRealQId,
          transaction
        );
        logger.debug(
          `        Created ${optionsWithRealQId.length} options for Question ${newQuestion.QuestionID}`
        );
      }
    }

    for (const aCreate of attachmentsToCreate) {
      const finalLessonId =
        typeof aCreate.lessonId === 'number'
          ? aCreate.lessonId
          : tempToRealLessonIdMap.get(aCreate.lessonId);
      if (!finalLessonId) {
        logger.error(
          `Missing real LessonID for attachment: ${aCreate.attachmentData.fileName}`
        );
        continue;
      }
      const { tempId, ...attachmentData } = aCreate.attachmentData;
      attachmentData.LessonID = finalLessonId;
      attachmentData.FileURL = 'pending_upload';
      attachmentData.CloudStorageID = null;
      await attachmentRepository.createAttachment(attachmentData, transaction);
      logger.debug(
        `      Created Attachment metadata "${attachmentData.fileName}" in Lesson ${finalLessonId}`
      );
    }
    for (const sCreate of subtitlesToCreate) {
      const finalLessonId =
        typeof sCreate.lessonId === 'number'
          ? sCreate.lessonId
          : tempToRealLessonIdMap.get(sCreate.lessonId);
      if (!finalLessonId) {
        logger.error(
          `Missing real LessonID for subtitle: ${sCreate.subtitleData.languageName}`
        );
        continue;
      }
      const { tempId, ...subtitleData } = sCreate.subtitleData;
      subtitleData.LessonID = finalLessonId;
      await subtitleRepository.addSubtitle(subtitleData, transaction);
      logger.debug(
        `      Created Subtitle "${subtitleData.languageName}" in Lesson ${finalLessonId}`
      );
    }

    // --- Step 5: Commit Transaction ---
    await transaction.commit();
    logger.info(
      `[Sync Curriculum] Transaction committed successfully for course ${courseId}.`
    );

    // --- Step 6: Trigger Background Deletion of Cloud Files ---
    if (cloudFilesToDelete.length > 0) {
      logger.info(
        `[Sync Curriculum] Triggering deletion of ${cloudFilesToDelete.length} files from cloud storage.`
      );
      Promise.allSettled(
        cloudFilesToDelete.map((file) =>
          cloudinaryUtil
            .deleteAsset(file.publicId, { resource_type: file.resourceType })
            .catch((err) =>
              logger.error(
                `Failed to delete ${file.resourceType} ${file.publicId} from cloud:`,
                err
              )
            )
        )
      ).then(() =>
        logger.info('[Sync Curriculum] Cloud file deletion process finished.')
      );
    }
  } catch (error) {
    // ... (Rollback và xử lý lỗi như cũ) ...
    logger.error(
      `[Sync Curriculum] Error during sync for course ${courseId}:`,
      error
    );
    if (
      transaction &&
      transaction.active &&
      !transaction._aborted &&
      !transaction._committed
    ) {
      // Kiểm tra transaction còn active không
      try {
        await transaction.rollback();
        logger.debug(`[Sync Curriculum] Transaction rolled back.`);
      } catch (rbError) {
        logger.error(
          `[Sync Curriculum] Error rolling back transaction:`,
          rbError
        );
      }
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to synchronize curriculum.'
    );
  }
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
  paginationOptions
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
    statusId: CourseStatus.PUBLISHED, // Mặc định chỉ lấy khóa học đã publish
  };

  // 3. Gọi hàm queryCourses hiện có (hoặc một hàm tương tự)
  const courses = await courseRepository.findAllCourses(
    combinedFilterOptions,
    paginationOptions
  );
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
  currentUser = null
) => {
  // 1. Kiểm tra xem instructorId có tồn tại và có phải là giảng viên không
  const instructor = await userRepository.findUserById(instructorId); // Giả sử có hàm này
  if (!instructor || instructor.RoleID !== Roles.INSTRUCTOR) {
    // Hoặc findUserProfileById nếu bạn dùng UserProfiles
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

  // Nếu không có statusId được chỉ định và người xem không có quyền xem non-published,
  // thì mặc định chỉ lấy các khóa học PUBLISHED.
  let effectiveStatusId = filterOptions.statusId;
  if (!filterOptions.statusId && !canViewNonPublished) {
    effectiveStatusId = CourseStatus.PUBLISHED;
  } else if (!filterOptions.statusId && canViewNonPublished) {
    effectiveStatusId = null; // Lấy tất cả trạng thái nếu có quyền và không chỉ định status
  }

  const combinedFilterOptions = {
    ...filterOptions,
    instructorId: parseInt(instructorId, 10), // Đảm bảo instructorId là số
    statusId: effectiveStatusId, // Sử dụng statusId đã được quyết định
  };

  // 3. Gọi hàm repository để lấy khóa học
  // Giả sử hàm findAllCourses trong repository có thể filter theo instructorId và statusId
  const coursesResult = await courseRepository.findAllCourses(
    combinedFilterOptions,
    paginationOptions
  );

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
  // Approval
  updateCourseThumbnail,
  updateCourseIntroVideo,
  submitCourseForApproval,
  reviewCourseApproval, // Cần hàm findApprovalRequestById
  getApprovalRequests,
  getApprovalRequestDetails,
  // getPendingCourses,
  // Feature
  toggleCourseFeature,
  // Sync Curriculum
  syncCurriculum,
  getCourseStatuses,
  queryCoursesByCategorySlug,
  queryCoursesByInstructor,
};
