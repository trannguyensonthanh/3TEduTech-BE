const httpStatus = require('http-status').status;
const axios = require('axios');
const lessonRepository = require('./lessons.repository');
const sectionRepository = require('../sections/sections.repository');
const { checkCourseAccess } = require('../sections/sections.service');
const ApiError = require('../../core/errors/ApiError');
const LessonType = require('../../core/enums/LessonType');
const logger = require('../../utils/logger');
const { getConnection, sql } = require('../../database/connection');
const cloudinaryUtil = require('../../utils/cloudinary.util');
const lessonAttachmentRepository = require('./lessonAttachment.repository');
const { extractYoutubeId, extractVimeoId } = require('../../utils/video.util');
const authRepository = require('../auth/auth.repository');
const enrollmentService = require('../enrollments/enrollments.service');
const Roles = require('../../core/enums/Roles');
const { youtubeApiKey } = require('../../config');
const { toCamelCaseObject } = require('../../utils/caseConverter');

const parseISO8601Duration = (duration) => {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
};

const getYoutubeVideoDuration = async (videoId) => {
  const apiKey = 'AIzaSyDvkT0dLa4ZffRdGroe1vPrgBiOb3UqLa4';
  const url = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=contentDetails&key=${apiKey}`;
  try {
    const response = await axios.get(url);
    const video = response.data.items[0];
    if (!video) {
      throw new Error('Không tìm thấy video trên YouTube.');
    }
    const durationISO = video.contentDetails.duration;
    const durationSeconds = parseISO8601Duration(durationISO);
    return durationSeconds;
  } catch (error) {
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
  await checkCourseAccess(section.CourseID, user, 'tạo bài học');
  const { lessonType, videoSourceType, externalVideoInput, ...restData } =
    lessonData;
  let { textContent } = lessonData;
  let resolvedVideoSourceType = null;
  let resolvedExternalVideoID = null;
  let resolvedVideoDuration = null;
  if (lessonType === LessonType.VIDEO) {
    if (
      !videoSourceType ||
      (videoSourceType !== 'CLOUDINARY' && !externalVideoInput)
    ) {
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
      resolvedVideoDuration = await getYoutubeVideoDuration(videoId);
    } else if (videoSourceType === 'VIMEO') {
      const videoId = extractVimeoId(externalVideoInput) || externalVideoInput;
      if (!videoId)
        throw new ApiError(httpStatus.BAD_REQUEST, 'URL Vimeo không hợp lệ.');
      resolvedVideoSourceType = 'VIMEO';
      resolvedExternalVideoID = videoId;
    } else if (videoSourceType === 'CLOUDINARY') {
      resolvedVideoSourceType = 'CLOUDINARY';
      resolvedExternalVideoID = null;
    } else {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Loại nguồn video không được hỗ trợ.'
      );
    }
    textContent = null;
  } else if (lessonType === LessonType.TEXT) {
    if (!textContent)
      throw new ApiError(httpStatus.BAD_REQUEST, 'Cần cung cấp nội dung text.');
    resolvedVideoSourceType = null;
    resolvedExternalVideoID = null;
    resolvedVideoDuration = null;
  } else if (lessonType === LessonType.QUIZ) {
    resolvedVideoSourceType = null;
    resolvedExternalVideoID = null;
    resolvedVideoDuration = null;
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
    VideoSourceType: resolvedVideoSourceType,
    ExternalVideoID: resolvedExternalVideoID,
    TextContent: textContent,
    VideoDurationSeconds: resolvedVideoDuration,
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
  const lessons = await lessonRepository.findLessonsBySectionId(sectionId);
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
  const dataToUpdate = { ...updateBody };
  delete dataToUpdate.lessonOrder;
  const newExternalInput = dataToUpdate.externalVideoInput;
  delete dataToUpdate.externalVideoInput;
  const requestedSourceType = dataToUpdate.videoSourceType;
  delete dataToUpdate.videoSourceType;
  const newType = dataToUpdate.lessonType || lesson.LessonType;
  const oldType = lesson.LessonType;
  const typeChanged = dataToUpdate.lessonType && newType !== oldType;
  if (typeChanged) {
    logger.info(
      `Lesson ${lessonId} type changing from ${oldType} to ${newType}. Cleaning up old data.`
    );
    if (
      oldType === LessonType.VIDEO &&
      lesson.VideoSourceType === 'CLOUDINARY' &&
      lesson.ExternalVideoID
    ) {
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
  if (newType === LessonType.VIDEO) {
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
        dataToUpdate.VideoSourceType = requestedSourceType;
        dataToUpdate.ExternalVideoID = videoId;
        dataToUpdate.TextContent = null;
      } else if (requestedSourceType === 'CLOUDINARY') {
        logger.warn(
          `Attempt to change video source to CLOUDINARY via general update API for lesson ${lessonId} was ignored. Use the dedicated video upload API.`
        );
        dataToUpdate.TextContent = null;
      } else {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Loại nguồn video không được hỗ trợ.'
        );
      }
    } else {
      if (typeChanged && oldType !== LessonType.VIDEO) {
        if (!lesson.VideoSourceType && !lesson.ExternalVideoID) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Vui lòng cung cấp nguồn video (upload hoặc link ngoài) khi chuyển sang loại VIDEO.'
          );
        }
      }
      dataToUpdate.TextContent = null;
    }
  } else if (newType === LessonType.TEXT) {
    if (dataToUpdate.textContent === undefined && typeChanged) {
      dataToUpdate.TextContent = null;
    } else if (dataToUpdate.textContent === undefined && !typeChanged) {
      delete dataToUpdate.textContent;
    }
    dataToUpdate.VideoSourceType = null;
    dataToUpdate.ExternalVideoID = null;
    dataToUpdate.VideoDurationSeconds = null;
  } else if (newType === LessonType.QUIZ) {
    dataToUpdate.VideoSourceType = null;
    dataToUpdate.ExternalVideoID = null;
    dataToUpdate.VideoDurationSeconds = null;
    dataToUpdate.TextContent = null;
  }
  if (!typeChanged) {
    delete dataToUpdate.lessonType;
  }
  if (newExternalInput === undefined) {
    delete dataToUpdate.videoSourceType;
  }
  const finalSourceType =
    dataToUpdate.VideoSourceType || lesson.VideoSourceType;
  if (
    dataToUpdate.videoDurationSeconds !== undefined &&
    finalSourceType !== 'CLOUDINARY'
  ) {
    delete dataToUpdate.videoDurationSeconds;
  }
  const finalUpdateData = Object.entries(dataToUpdate).reduce(
    (acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    },
    {}
  );
  if (Object.keys(finalUpdateData).length === 0) {
    logger.warn(`Update lesson ${lessonId} called with no actual changes.`);
    return lesson;
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
  const uploadResult = await cloudinaryUtil.uploadStream(file.buffer, {
    folder: `courses/${lesson.CourseID}/lessons/${lessonId}/videos_private`,
    resource_type: 'video',
    type: 'private',
  });
  const updateData = {
    VideoSourceType: 'CLOUDINARY',
    ExternalVideoID: uploadResult.public_id,
    VideoDurationSeconds: Math.round(uploadResult.duration || 0),
    TextContent: null,
  };
  const updatedLesson = await lessonRepository.updateLessonById(
    lessonId,
    updateData
  );
  if (!updatedLesson) {
    logger.error(
      `Failed to update lesson ${lessonId} in DB after video upload. Uploaded public_id: ${uploadResult.public_id}`
    );
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
      'Có lỗi xảy ra khi cập nhật thông tin bài học.'
    );
  }
  return toCamelCaseObject(updatedLesson);
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
  let uploadResult;
  try {
    const options = {
      folder: `courses/${lesson.CourseID}/lessons/${lessonId}/attachments`,
      resource_type: 'raw',
      use_filename: true,
      unique_filename: false,
      overwrite: false,
    };
    uploadResult = await cloudinaryUtil.uploadStream(file.buffer, options);
  } catch (uploadError) {
    if (uploadError.http_code === 409) {
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
  const attachmentData = {
    LessonID: lessonId,
    FileName: file.originalname,
    FileURL: uploadResult.secure_url,
    FileType: file.mimetype,
    FileSize: file.size,
    CloudStorageID: uploadResult.public_id,
  };
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
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'File đính kèm không tồn tại hoặc không thuộc bài học này.'
    );
  }
  const lesson = await lessonRepository.findLessonById(lessonId);
  if (!lesson) {
    logger.error(
      `Lesson ${lessonId} not found while deleting attachment ${attachmentId}.`
    );
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Bài học chứa file đính kèm không tồn tại.'
    );
  }
  await checkCourseAccess(lesson.CourseID, user, 'xóa file đính kèm');
  if (attachment.CloudStorageID) {
    try {
      await cloudinaryUtil.deleteAsset(attachment.CloudStorageID, {
        resource_type: 'raw',
      });
      logger.info(
        `Attachment deleted from Cloudinary: ${attachment.CloudStorageID}`
      );
    } catch (deleteError) {
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
  if (
    lesson.VideoSourceType === 'YOUTUBE' ||
    lesson.VideoSourceType === 'VIMEO'
  ) {
    if (lesson.VideoSourceType === 'YOUTUBE') {
      return {
        publicEmbedUrl: `https://www.youtube.com/embed/${lesson.ExternalVideoID}`,
      };
    }
    return {
      publicEmbedUrl: `https://player.vimeo.com/video/${lesson.ExternalVideoID}`,
    };
  }
  if (lesson.IsFreePreview && lesson.VideoSourceType === 'EXTERNAL_URL') {
    return { publicUrl: lesson.ExternalVideoID };
  }
  if (lesson.VideoSourceType !== 'CLOUDINARY') {
    if (!lesson.IsFreePreview) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        'Không tìm thấy video Cloudinary cho bài học này.'
      );
    }
  }
  const publicId = lesson.ExternalVideoID;
  if (!publicId) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Không tìm thấy thông tin video Cloudinary.'
    );
  }
  let canAccessPrivateVideo = lesson.IsFreePreview;
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
  try {
    const signedUrl = cloudinaryUtil.generateSignedUrl(publicId, {
      resource_type: 'video',
      type: 'private',
      expires_in: 3600,
      sign_url: true,
    });
    return {
      signedUrl,
    };
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
