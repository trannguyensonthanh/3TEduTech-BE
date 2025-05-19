const httpStatus = require('http-status').status;
const axios = require('axios');
const lessonRepository = require('./lessons.repository');
const sectionRepository = require('../sections/sections.repository'); // Để kiểm tra section
const { checkCourseAccess } = require('../sections/sections.service'); // Dùng lại hàm kiểm tra quyền từ section service
const ApiError = require('../../core/errors/ApiError');
const LessonType = require('../../core/enums/LessonType');
const logger = require('../../utils/logger');
const { getConnection, sql } = require('../../database/connection'); // Cần cho transaction
const cloudinaryUtil = require('../../utils/cloudinary.util'); // *** THÊM IMPORT ***
const lessonAttachmentRepository = require('./lessonAttachment.repository');
const { extractYoutubeId, extractVimeoId } = require('../../utils/video.util');
const authRepository = require('../auth/auth.repository');
const enrollmentService = require('../enrollments/enrollments.service');
const Roles = require('../../core/enums/Roles');
const { youtubeApiKey } = require('../../config');
const { toCamelCaseObject } = require('../../utils/caseConverter');

// Hàm chuyển đổi ISO 8601 duration thành giây
const parseISO8601Duration = (duration) => {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
};

const getYoutubeVideoDuration = async (videoId) => {
  const apiKey = 'AIzaSyDvkT0dLa4ZffRdGroe1vPrgBiOb3UqLa4'; // Đặt API Key trong biến môi trường
  const url = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=contentDetails&key=${apiKey}`;
  console.log('YouTube API URL:', url); // Debug log
  try {
    const response = await axios.get(url);
    const video = response.data.items[0];
    if (!video) {
      throw new Error('Không tìm thấy video trên YouTube.');
    }

    // Duration ở định dạng ISO 8601 (ví dụ: PT1H2M3S)
    const durationISO = video.contentDetails.duration;
    const durationSeconds = parseISO8601Duration(durationISO);
    return durationSeconds;
  } catch (error) {
    console.error('Lỗi khi lấy thông tin video từ YouTube:', error.message);
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Không thể lấy thông tin video từ YouTube.'
    );
  }
};

/**
 * Tạo lesson mới cho section.
 * @param {number} sectionId
 * @param {object} lessonData - Dữ liệu lesson.
 * @param {object} user - Người dùng tạo.
 * @returns {Promise<object>} - Lesson mới.
 */
const createLesson = async (sectionId, lessonData, user) => {
  const section = await sectionRepository.findSectionById(sectionId);
  if (!section) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Chương không tồn tại.');
  }
  // Kiểm tra quyền trên khóa học chứa section này
  await checkCourseAccess(section.CourseID, user, 'tạo bài học');

  // Validate content based on type
  const {
    lessonType,
    videoSourceType, // Nhận type từ FE
    externalVideoInput, // Nhận link YT/Vimeo hoặc ID (nếu FE xử lý sẵn)
    ...restData
  } = lessonData;
  let { textContent } = lessonData;

  let resolvedVideoSourceType = null;
  let resolvedExternalVideoID = null;
  let resolvedVideoDuration = null; // Thời gian video (nếu có
  if (lessonType === LessonType.VIDEO) {
    if (
      !videoSourceType ||
      (videoSourceType !== 'CLOUDINARY' && !externalVideoInput)
    ) {
      // Yêu cầu FE phải gửi cả type và data tương ứng, trừ khi là Cloudinary
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Vui lòng chọn nguồn video (YouTube/Vimeo/Cloudinary) và cung cấp thông tin.'
      );
    }

    if (videoSourceType === 'YOUTUBE') {
      const videoId =
        extractYoutubeId(externalVideoInput) || externalVideoInput;
      if (!videoId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'URL YouTube không hợp lệ.');
      }
      resolvedVideoSourceType = 'YOUTUBE';
      resolvedExternalVideoID = videoId;

      // Lấy duration từ YouTube
      resolvedVideoDuration = await getYoutubeVideoDuration(videoId);
    } else if (videoSourceType === 'VIMEO') {
      const videoId = extractVimeoId(externalVideoInput) || externalVideoInput;
      if (!videoId)
        throw new ApiError(httpStatus.BAD_REQUEST, 'URL Vimeo không hợp lệ.');
      resolvedVideoSourceType = 'VIMEO';
      resolvedExternalVideoID = videoId;
    } else if (videoSourceType === 'CLOUDINARY') {
      // Nếu là Cloudinary, không cần externalVideoInput vì sẽ được cập nhật sau
      resolvedVideoSourceType = 'CLOUDINARY';
      resolvedExternalVideoID = null; // Để null vì sẽ được cập nhật qua API upload
    } else {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Loại nguồn video không được hỗ trợ.'
      );
    }
    textContent = null; // Xóa text
  } else if (lessonType === LessonType.TEXT) {
    if (!textContent)
      throw new ApiError(httpStatus.BAD_REQUEST, 'Cần cung cấp nội dung text.');
    resolvedVideoSourceType = null;
    resolvedExternalVideoID = null;
    resolvedVideoDuration = null; // Không có video
  } else if (lessonType === LessonType.QUIZ) {
    resolvedVideoSourceType = null;
    resolvedExternalVideoID = null;
    resolvedVideoDuration = null; // Không có video
    textContent = null;
  }

  const maxOrder = await lessonRepository.getMaxLessonOrder(sectionId);
  const newOrder = maxOrder + 1;

  const newLessonData = {
    ...restData,
    LessonName: lessonData.lessonName,
    Description: lessonData.description,
    IsFreePreview: lessonData.isFreePreview,

    SectionID: sectionId,
    LessonOrder: newOrder,
    LessonType: lessonType,
    VideoSourceType: resolvedVideoSourceType, // *** Lưu type ***
    ExternalVideoID: resolvedExternalVideoID, // *** Lưu ID/URL ***
    TextContent: textContent,
    VideoDurationSeconds: resolvedVideoDuration, // *** Lưu duration ***
    // Xóa các trường không liên quan đến loại bài học trước khi lưu
    ...(lessonType !== LessonType.VIDEO && {
      ThumbnailUrl: null,
      VideoDurationSeconds: null,
    }),
  };
  const result = await lessonRepository.createLesson(newLessonData);

  return toCamelCaseObject(result);
};

/**
 * Lấy tất cả lessons của một section.
 * @param {number} sectionId
 * @param {object} user - Người dùng (để kiểm tra quyền xem free preview).
 * @returns {Promise<object[]>}
 */
const getLessonsBySection = async (sectionId, user) => {
  const section = await sectionRepository.findSectionById(sectionId);
  if (!section) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Chương không tồn tại.');
  }
  // TODO: Kiểm tra quyền xem khóa học (courseId) nếu cần thiết ở đây
  // Ví dụ: Nếu chỉ enrolled user mới xem được non-free preview lessons

  const lessons = await lessonRepository.findLessonsBySectionId(sectionId);

  // Xử lý ẩn nội dung nếu không phải free preview và user chưa enroll (logic này cần bổ sung sau khi có enrollment)
  // const isEnrolled = user ? await enrollmentService.isUserEnrolled(user.id, section.CourseID) : false;
  // lessons.forEach(lesson => {
  //     if (!lesson.IsFreePreview && !isEnrolled) {
  //         // Ẩn nội dung nhạy cảm
  //         lesson.VideoUrl = null;
  //         lesson.TextContent = null;
  //         // ...
  //     }
  // });

  return lessons;
};

/**
 * Lấy chi tiết một bài học.
 * @param {number} lessonId
 * @param {object} user - Người dùng (để kiểm tra quyền xem free preview).
 * @returns {Promise<object>}
 */
const getLesson = async (lessonId, user) => {
  const lesson = await lessonRepository.findLessonById(lessonId);
  if (!lesson) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Bài học không tồn tại.');
  }

  // TODO: Kiểm tra quyền xem khóa học và xử lý free preview như getLessonsBySection

  // Tải thêm dữ liệu liên quan nếu cần (vd: attachments, quiz questions)

  return toCamelCaseObject(lesson);
};

/**
 * Cập nhật lesson, xử lý chuyển đổi type, dọn dẹp dữ liệu cũ,
 * và bỏ qua thay đổi nguồn thành Cloudinary qua API này.
 * @param {number} lessonId
 * @param {object} updateBody - Dữ liệu cập nhật từ request.
 * @param {object} user - Người dùng cập nhật.
 * @returns {Promise<object>} - Lesson đã cập nhật.
 */
const updateLesson = async (lessonId, updateBody, user) => {
  const lesson = await lessonRepository.findLessonById(lessonId);
  if (!lesson) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Bài học không tồn tại.');
  }
  await checkCourseAccess(lesson.CourseID, user, 'cập nhật bài học');

  // Tạo bản sao để không ảnh hưởng object gốc và dễ dàng xóa key
  const dataToUpdate = { ...updateBody };

  // Không cho phép cập nhật LessonOrder qua API này
  delete dataToUpdate.lessonOrder;
  // Xóa các input tạm thời không lưu trực tiếp vào DB
  const newExternalInput = dataToUpdate.externalVideoInput;
  delete dataToUpdate.externalVideoInput; // Xóa input tạm này
  const requestedSourceType = dataToUpdate.videoSourceType; // Lưu lại source type yêu cầu (nếu có)
  delete dataToUpdate.videoSourceType; // Xóa khỏi data update chính, sẽ gán lại sau nếu hợp lệ

  const newType = dataToUpdate.lessonType || lesson.LessonType;
  const oldType = lesson.LessonType;
  const typeChanged = dataToUpdate.lessonType && newType !== oldType;

  // --- Dọn dẹp dữ liệu cũ khi TYPE THAY ĐỔI ---
  if (typeChanged) {
    logger.info(
      `Lesson ${lessonId} type changing from ${oldType} to ${newType}. Cleaning up old data.`
    );
    if (
      oldType === LessonType.VIDEO &&
      lesson.VideoSourceType === 'CLOUDINARY' &&
      lesson.ExternalVideoID
    ) {
      // Xóa video Cloudinary cũ (chạy ngầm)
      cloudinaryUtil
        .deleteAsset(lesson.ExternalVideoID, {
          resource_type: 'video',
          type: 'private',
        })
        .catch((err) =>
          logger.error(
            `Failed to delete old Cloudinary video ${lesson.ExternalVideoID} during type change:`,
            err
          )
        );
    }
    // Reset các trường thuộc về type cũ trong dataToUpdate
    if (oldType === LessonType.VIDEO) {
      dataToUpdate.VideoSourceType = null;
      dataToUpdate.ExternalVideoID = null;
      dataToUpdate.VideoDurationSeconds = null;
      dataToUpdate.ThumbnailUrl = null;
    }
    if (oldType === LessonType.TEXT) {
      dataToUpdate.TextContent = null;
    }
    if (oldType === LessonType.QUIZ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Vui lòng xóa các dữ liệu quiz liên quan trước khi chuyển đổi loại bài học.'
      );
    }
  }

  // --- Xử lý và Validate dữ liệu cho TYPE MỚI (hoặc type cũ nếu không đổi) ---
  if (newType === LessonType.VIDEO) {
    // --- Trường hợp User CỐ GẮNG THAY ĐỔI NGUỒN VIDEO qua API này ---
    if (newExternalInput !== undefined) {
      if (!requestedSourceType)
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Cần cung cấp loại nguồn video (videoSourceType) khi cập nhật thông tin video.'
        );

      if (
        requestedSourceType === 'YOUTUBE' ||
        requestedSourceType === 'VIMEO'
      ) {
        const videoId =
          (requestedSourceType === 'YOUTUBE'
            ? extractYoutubeId(newExternalInput)
            : extractVimeoId(newExternalInput)) || newExternalInput;
        if (!videoId)
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `URL ${requestedSourceType} không hợp lệ.`
          );

        // Xóa video Cloudinary cũ nếu đang đổi từ Cloudinary sang link ngoài
        if (
          lesson.VideoSourceType === 'CLOUDINARY' &&
          lesson.ExternalVideoID &&
          requestedSourceType !== 'CLOUDINARY'
        ) {
          cloudinaryUtil
            .deleteAsset(lesson.ExternalVideoID, {
              resource_type: 'video',
            })
            .catch((err) =>
              logger.error(
                `Failed to delete old Cloudinary video ${lesson.ExternalVideoID} during video source update:`,
                err
              )
            );
        }

        dataToUpdate.VideoSourceType = requestedSourceType; // Cập nhật type mới
        dataToUpdate.ExternalVideoID = videoId; // Cập nhật ID/link mới
        dataToUpdate.TextContent = null; // Xóa text
      } else if (requestedSourceType === 'CLOUDINARY') {
        // *** BỎ QUA yêu cầu thay đổi thành Cloudinary qua API này ***
        logger.warn(
          `Attempt to change video source to CLOUDINARY via general update API for lesson ${lessonId} was ignored. Use the dedicated video upload API.`
        );
        // Không gán dataToUpdate.VideoSourceType hay ExternalVideoID ở đây
        // -> giữ lại giá trị cũ từ DB nếu trước đó là Cloudinary
        // -> hoặc giữ null nếu trước đó là type khác
        // -> Đảm bảo TextContent vẫn bị xóa nếu type là VIDEO
        dataToUpdate.TextContent = null;
      } else {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Loại nguồn video không được hỗ trợ.'
        );
      }
    }
    // --- Trường hợp User KHÔNG thay đổi nguồn video ---
    else {
      // Nếu chỉ đổi type sang VIDEO (từ Text/Quiz)
      if (typeChanged && oldType !== LessonType.VIDEO) {
        // Nếu bài học cũ không có nguồn video nào -> Báo lỗi yêu cầu cung cấp nguồn
        if (!lesson.VideoSourceType && !lesson.ExternalVideoID) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Vui lòng cung cấp nguồn video (upload hoặc link ngoài) khi chuyển sang loại VIDEO.'
          );
        }
        // Nếu bài học cũ đã có nguồn (do lỗi logic trước đó?), thì giữ lại nguồn đó? --> Nên xóa khi đổi type ở trên
        // Logic dọn dẹp ở trên đã set các trường video thành null, nên cần phải có nguồn mới
      }
      // Nếu không đổi type VÀ không cung cấp nguồn mới -> giữ nguyên nguồn cũ
      // Chỉ cần đảm bảo TextContent là null
      dataToUpdate.TextContent = null;
    }
  } else if (newType === LessonType.TEXT) {
    // Đã xử lý xóa video cũ nếu typeChanged.
    if (dataToUpdate.textContent === undefined && typeChanged) {
      dataToUpdate.TextContent = null; // Xóa content nếu đổi type mà ko có content mới
    } else if (dataToUpdate.textContent === undefined && !typeChanged) {
      delete dataToUpdate.textContent; // Không update nếu ko có giá trị mới
    }
    // Đảm bảo các trường video là null (đã làm ở phần typeChanged nếu có)
    dataToUpdate.VideoSourceType = null;
    dataToUpdate.ExternalVideoID = null;
    dataToUpdate.VideoDurationSeconds = null;
  } else if (newType === LessonType.QUIZ) {
    // Đã xử lý xóa video/text cũ nếu typeChanged.
    dataToUpdate.VideoSourceType = null;
    dataToUpdate.ExternalVideoID = null;
    dataToUpdate.VideoDurationSeconds = null;
    dataToUpdate.TextContent = null;
  }

  // --- Loại bỏ các trường không hợp lệ hoặc không thay đổi ---
  // Xóa lessonType nếu không thực sự thay đổi
  if (!typeChanged) {
    delete dataToUpdate.lessonType;
  }
  // Xóa videoSourceType nếu không có thay đổi nguồn (để tránh ghi đè giá trị cũ không cần thiết)
  if (newExternalInput === undefined) {
    delete dataToUpdate.videoSourceType;
  }
  // Xóa duration nếu không phải video Cloudinary (trừ khi user tự gửi lên?)
  const finalSourceType =
    dataToUpdate.VideoSourceType || lesson.VideoSourceType;
  if (
    dataToUpdate.videoDurationSeconds !== undefined &&
    finalSourceType !== 'CLOUDINARY'
  ) {
    delete dataToUpdate.videoDurationSeconds;
  }

  // Lọc bỏ các key có giá trị undefined
  const finalUpdateData = Object.entries(dataToUpdate).reduce(
    (acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    },
    {}
  );

  // --- Thực hiện Update ---
  if (Object.keys(finalUpdateData).length === 0) {
    logger.warn(`Update lesson ${lessonId} called with no actual changes.`);
    return lesson; // Trả về lesson gốc
  }

  const updatedLessonRaw = await lessonRepository.updateLessonById(
    lessonId,
    finalUpdateData
  );

  if (!updatedLessonRaw) {
    logger.error(
      `Failed to update lesson ${lessonId} in DB, repository returned null.`
    );
    const latestLesson = await lessonRepository.findLessonById(lessonId);
    return latestLesson || lesson;
  }

  return toCamelCaseObject(updatedLessonRaw);
};

/**
 * Xóa lesson.
 * @param {number} lessonId
 * @param {object} user - Người dùng xóa.
 * @returns {Promise<void>}
 */
const deleteLesson = async (lessonId, user) => {
  const lesson = await lessonRepository.findLessonById(lessonId);
  if (!lesson) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Bài học không tồn tại.');
  }
  await checkCourseAccess(lesson.CourseID, user, 'xóa bài học');

  // TODO: Xóa tài nguyên Cloudinary của lesson này TRƯỚC KHI xóa DB
  // Xóa video
  if (lesson.ExternalVideoID) {
    try {
      await cloudinaryUtil.deleteAsset(lesson.ExternalVideoID, {
        resource_type: 'video',
      });
      logger.info(
        `Lesson video deleted from Cloudinary: ${lesson.ExternalVideoID} (during lesson delete)`
      );
    } catch (error) {
      logger.error(
        `Failed to delete lesson video ${lesson.ExternalVideoID} (during lesson delete):`,
        error
      );
    }
  }
  // Xóa attachments
  const attachments =
    await lessonAttachmentRepository.findAttachmentsByLessonId(lesson.LessonID);

  for (const attachment of attachments) {
    if (attachment.CloudStorageID) {
      try {
        await cloudinaryUtil.deleteAsset(attachment.CloudStorageID, {
          resource_type: 'raw',
        });
        logger.info(
          `Lesson attachment deleted from Cloudinary: ${attachment.CloudStorageID} (during lesson delete)`
        );
      } catch (error) {
        logger.error(
          `Failed to delete lesson attachment ${attachment.CloudStorageID} (during lesson delete):`,
          error
        );
      }
    }
  }

  // Thực hiện xóa lesson khỏi DB (sẽ xóa attachments theo CASCADE nếu FK đúng)
  await lessonRepository.deleteLessonById(lessonId);
  logger.info(`Lesson ${lessonId} deleted from DB by user ${user.id}`);
};

/**
 * Cập nhật thứ tự các lessons của một section.
 * @param {number} sectionId
 * @param {Array<{id: number, order: number}>} lessonOrders - Mảng lesson và thứ tự mới.
 * @param {object} user - Người dùng thực hiện.
 * @returns {Promise<void>}
 */
const updateLessonsOrder = async (sectionId, lessonOrders, user) => {
  const section = await sectionRepository.findSectionById(sectionId);
  if (!section) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Chương không tồn tại.');
  }
  await checkCourseAccess(section.CourseID, user, 'sắp xếp bài học');

  // Validate input tương tự như updateSectionsOrder
  const currentLessons =
    await lessonRepository.findLessonsBySectionId(sectionId);
  const currentLessonIds = currentLessons.map((l) => l.LessonID);
  const requestLessonIds = lessonOrders.map((l) => l.id);
  const requestOrders = lessonOrders.map((l) => l.order);

  if (
    !requestLessonIds.every((id) => currentLessonIds.includes(id)) ||
    requestLessonIds.length !== currentLessonIds.length ||
    !currentLessonIds.every((id) => requestLessonIds.includes(id))
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Danh sách bài học không hợp lệ cho chương này.'
    );
  }
  if (new Set(requestOrders).size !== requestOrders.length) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Thứ tự bài học không được trùng lặp.'
    );
  }
  const sortedOrders = [...requestOrders].sort((a, b) => a - b);
  if (
    sortedOrders[0] !== 0 ||
    !sortedOrders.every((order, index) => order === index)
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Thứ tự bài học phải liên tục và bắt đầu từ 0.'
    );
  }

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    await lessonRepository.updateLessonsOrder(lessonOrders, transaction);
    await transaction.commit();
    logger.info(
      `Lessons order updated for section ${sectionId} by user ${user.id}`
    );
  } catch (error) {
    logger.error(
      `Error updating lessons order for section ${sectionId}:`,
      error
    );
    await transaction.rollback();
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Cập nhật thứ tự bài học thất bại.'
    );
  }
};

/**
 * Cập nhật video cho bài học.
 * @param {number} lessonId
 * @param {object} file - File object từ multer (req.file).
 * @param {object} user - Người dùng thực hiện.
 * @returns {Promise<object>} - Bài học với video đã cập nhật.
 */
const updateLessonVideo = async (lessonId, file, user) => {
  const lesson = await lessonRepository.findLessonById(lessonId);
  if (!lesson) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Bài học không tồn tại.');
  }
  if (lesson.LessonType !== LessonType.VIDEO) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Bài học này không phải loại VIDEO.'
    );
  }
  await checkCourseAccess(lesson.CourseID, user, 'cập nhật video bài học');

  if (!file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Vui lòng chọn file video.');
  }

  // Xóa video cũ nếu có
  if (lesson.VideoSourceType === 'CLOUDINARY' && lesson.ExternalVideoID) {
    try {
      await cloudinaryUtil.deleteAsset(lesson.ExternalVideoID, {
        resource_type: 'video',
        type: 'private',
      });
      logger.info(`Old Cloudinary video deleted: ${lesson.ExternalVideoID}`);
    } catch (deleteError) {
      logger.error(
        `Failed to delete old video ${lesson.ExternalVideoID}:`,
        deleteError
      );
    }
  }

  // Upload video mới
  const uploadResult = await cloudinaryUtil.uploadStream(file.buffer, {
    folder: `courses/${lesson.CourseID}/lessons/${lessonId}/videos_private`,
    resource_type: 'video',
    type: 'private', // *** Đảm bảo là private ***
  });

  // Cập nhật DB
  const updateData = {
    VideoSourceType: 'CLOUDINARY', // *** Set type ***
    ExternalVideoID: uploadResult.public_id, // *** Lưu public_id vào ExternalVideoID ***
    VideoDurationSeconds: Math.round(uploadResult.duration || 0),
    TextContent: null, // Xóa text
  };
  console.log('Update Data:', updateData); // Debug log
  const updatedLesson = await lessonRepository.updateLessonById(
    lessonId,
    updateData
  );
  if (!updatedLesson) {
    logger.error(
      `Failed to update lesson ${lessonId} in DB after video upload. Uploaded public_id: ${uploadResult.public_id}`
    );
    // Cân nhắc xóa file vừa upload nếu không cập nhật được DB (quan trọng)
    try {
      await cloudinaryUtil.deleteAsset(uploadResult.public_id, {
        resource_type: 'video',
      });
      logger.warn(
        `Rolled back Cloudinary upload due to DB update failure: ${uploadResult.public_id}`
      );
    } catch (rollbackError) {
      logger.error(
        `Failed to rollback Cloudinary upload ${uploadResult.public_id}:`,
        rollbackError
      );
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Có lỗi xảy ra khi cập nhật thông tin bài học.' // Thông báo thân thiện hơn
    );
  }

  // Không nên trả về toàn bộ updatedLesson có thể chứa dữ liệu nhạy cảm?
  // Trả về thông tin cần thiết hoặc thông báo thành công.
  return toCamelCaseObject(updatedLesson);
  // return {
  //   message: 'Cập nhật video thành công.',
  //   videoInfo: {
  //     publicId: updatedLesson.ExternalVideoID,
  //     duration: updatedLesson.VideoDurationSeconds,
  //   },
  // };
};
/**
 * Thêm file đính kèm cho bài học.
 * @param {number} lessonId
 * @param {object} file - File object từ multer (req.file).
 * @param {object} user - Người dùng thực hiện.
 * @returns {Promise<object>} - File đính kèm đã tạo.
 */
const addLessonAttachment = async (lessonId, file, user) => {
  const lesson = await lessonRepository.findLessonById(lessonId);
  if (!lesson) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Bài học không tồn tại.');
  }
  await checkCourseAccess(lesson.CourseID, user, 'thêm file đính kèm');

  if (!file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Vui lòng chọn file đính kèm.');
  }

  // Upload file lên Cloudinary (resource_type: 'raw' hoặc 'auto')
  let uploadResult;
  try {
    const options = {
      folder: `courses/${lesson.CourseID}/lessons/${lessonId}/attachments`,
      resource_type: 'raw', // Lưu trữ file gốc
      use_filename: true, // Dùng tên file gốc làm public_id (cần unique)
      unique_filename: false, // Không tự thêm hậu tố random (nếu use_filename=true)
      overwrite: false, // Báo lỗi nếu file đã tồn tại với cùng tên
    };
    // Hoặc không dùng use_filename để Cloudinary tự tạo ID
    // const options = {
    //      folder: `courses/${lesson.CourseID}/lessons/${lessonId}/attachments`,
    //      resource_type: 'raw',
    // };
    uploadResult = await cloudinaryUtil.uploadStream(file.buffer, options);
  } catch (uploadError) {
    // Xử lý lỗi file trùng tên nếu dùng use_filename=true, overwrite=false
    if (uploadError.http_code === 409) {
      // Conflict
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `File với tên '${file.originalname}' đã tồn tại.`
      );
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Upload file đính kèm thất bại.'
    );
  }

  // Lưu thông tin vào DB
  const attachmentData = {
    LessonID: lessonId,
    FileName: file.originalname, // Tên file gốc để hiển thị
    FileURL: uploadResult.secure_url,
    FileType: file.mimetype, // Hoặc lấy từ uploadResult.format
    FileSize: file.size, // Hoặc uploadResult.bytes
    CloudStorageID: uploadResult.public_id, // Rất quan trọng để xóa
  };

  console.log('Attachment Data:', attachmentData); // Debug log

  const newAttachment =
    await lessonAttachmentRepository.createAttachment(attachmentData);
  return toCamelCaseObject(newAttachment);
};

/**
 * Xóa file đính kèm.
 * @param {number} lessonId - (Optional, để kiểm tra lesson tồn tại).
 * @param {number} attachmentId
 * @param {object} user - Người dùng thực hiện.
 * @returns {Promise<void>}
 */
const deleteLessonAttachment = async (lessonId, attachmentId, user) => {
  const attachment =
    await lessonAttachmentRepository.findAttachmentById(attachmentId);
  if (!attachment || attachment.LessonID !== lessonId) {
    // Đảm bảo attachment thuộc đúng lesson
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'File đính kèm không tồn tại hoặc không thuộc bài học này.'
    );
  }

  // Kiểm tra quyền dựa trên khóa học chứa bài học
  const lesson = await lessonRepository.findLessonById(lessonId); // Cần lesson để lấy courseId
  if (!lesson) {
    // Trường hợp lạ: attachment tồn tại nhưng lesson không tồn tại?
    logger.error(
      `Lesson ${lessonId} not found while deleting attachment ${attachmentId}.`
    );
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Bài học chứa file đính kèm không tồn tại.'
    );
  }
  await checkCourseAccess(lesson.CourseID, user, 'xóa file đính kèm');

  // Xóa file trên Cloudinary
  if (attachment.CloudStorageID) {
    try {
      // Cần xác định đúng resource_type khi xóa (thường là 'raw' cho attachment)
      await cloudinaryUtil.deleteAsset(attachment.CloudStorageID, {
        resource_type: 'raw',
      });
      logger.info(
        `Attachment deleted from Cloudinary: ${attachment.CloudStorageID}`
      );
    } catch (deleteError) {
      // Không nên chặn xóa DB nếu xóa Cloudinary lỗi, chỉ log
      logger.error(
        `Failed to delete attachment ${attachment.CloudStorageID} from Cloudinary:`,
        deleteError
      );
    }
  } else {
    logger.warn(
      `Attachment ${attachmentId} has no CloudStorageID. Cannot delete from Cloudinary.`
    );
  }

  // Xóa bản ghi trong DB
  await lessonAttachmentRepository.deleteAttachmentById(attachmentId);
  logger.info(`Attachment ${attachmentId} deleted from DB by user ${user.id}`);
};

/**
 * Lấy Signed URL để xem video private của bài học.
 * @param {number} accountId - ID người dùng yêu cầu.
 * @param {number} lessonId - ID bài học.
 * @returns {Promise<{ signedUrl: string }>} - Object chứa URL có chữ ký.
 */
const getLessonVideoUrl = async (accountId, lessonId) => {
  const lesson = await lessonRepository.findLessonById(lessonId);
  if (!lesson) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Bài học không tồn tại.');
  }
  if (lesson.LessonType !== LessonType.VIDEO) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Bài học này không chứa video.');
  }

  // Xử lý Free Preview cho link ngoài trước
  if (
    lesson.IsFreePreview &&
    (lesson.VideoSourceType === 'YOUTUBE' || lesson.VideoSourceType === 'VIMEO')
  ) {
    if (lesson.VideoSourceType === 'YOUTUBE') {
      // Tạo URL nhúng YouTube từ ExternalVideoID (videoId)
      return {
        publicEmbedUrl: `https://www.youtube.com/embed/${lesson.ExternalVideoID}`,
      };
    }
    // Tạo URL nhúng Vimeo từ ExternalVideoID (videoId)
    return {
      publicEmbedUrl: `https://player.vimeo.com/video/${lesson.ExternalVideoID}`,
    };
  }
  if (lesson.IsFreePreview && lesson.VideoSourceType === 'EXTERNAL_URL') {
    return { publicUrl: lesson.ExternalVideoID }; // Trả về link public
  }

  // Chỉ xử lý Cloudinary nếu là Cloudinary hoặc nếu free preview nhưng ko phải link ngoài
  if (lesson.VideoSourceType !== 'CLOUDINARY') {
    if (!lesson.IsFreePreview) {
      // Nếu ko free và ko phải Cloudinary -> Lỗi? Hoặc đã xử lý ở trên?
      throw new ApiError(
        httpStatus.NOT_FOUND,
        'Không tìm thấy video Cloudinary cho bài học này.'
      );
    }
    // Nếu free preview mà source ko phải Cloudinary thì đã return ở trên rồi
  }

  // Từ đây trở đi, chắc chắn là video Cloudinary (hoặc free preview là Cloudinary)
  const publicId = lesson.ExternalVideoID; // Public ID lưu ở ExternalVideoID
  if (!publicId) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Không tìm thấy thông tin video Cloudinary.'
    );
  }

  // Kiểm tra quyền truy cập (chỉ cần nếu !IsFreePreview)
  let canAccessPrivateVideo = lesson.IsFreePreview; // Mặc định cho phép nếu là free preview
  if (!canAccessPrivateVideo) {
    const user = await authRepository.findAccountById(accountId);
    if (!user)
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Người dùng không hợp lệ.');
    const isAdmin =
      user.RoleID === Roles.ADMIN || user.RoleID === Roles.SUPERADMIN;
    const isOwnerInstructor =
      user.RoleID === Roles.INSTRUCTOR &&
      lesson.InstructorID === user.AccountID;
    let isEnrolled = false;
    if (!isAdmin && !isOwnerInstructor) {
      isEnrolled = await enrollmentService.isUserEnrolled(
        accountId,
        lesson.CourseID
      );
    }
    canAccessPrivateVideo = isAdmin || isOwnerInstructor || isEnrolled;
  }

  if (!canAccessPrivateVideo) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Bạn không có quyền xem video này.'
    );
  }

  // Tạo Signed URL
  try {
    const signedUrl = cloudinaryUtil.generateSignedUrl(publicId, {
      resource_type: 'video',
      type: 'private', // Luôn là private
      expires_in: 3600, // 1 giờ
      sign_url: true,
    });
    console.log('Generated signed URL:', signedUrl); // Debug log
    return { signedUrl };
  } catch (error) {
    logger.error(
      `Failed to generate signed URL for lesson ${lessonId}, publicId ${lesson.VideoPublicId}:`,
      error
    );
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Không thể tạo đường dẫn xem video.'
    );
  }
};

module.exports = {
  createLesson,
  getLessonsBySection,
  getLesson,
  updateLesson,
  deleteLesson,
  updateLessonsOrder,
  updateLessonVideo,
  addLessonAttachment,
  deleteLessonAttachment,
  getLessonVideoUrl,
};
