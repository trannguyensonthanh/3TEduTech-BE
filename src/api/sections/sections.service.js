const httpStatus = require('http-status').status;
const sectionRepository = require('./sections.repository');
const courseRepository = require('../courses/courses.repository');
const ApiError = require('../../core/errors/ApiError');
const CourseStatus = require('../../core/enums/CourseStatus');
const Roles = require('../../core/enums/Roles');
const logger = require('../../utils/logger');
const { getConnection, sql } = require('../../database/connection');
const lessonRepository = require('../lessons/lessons.repository');
const lessonAttachmentRepository = require('../lessons/lessonAttachment.repository');
const cloudinaryUtil = require('../../utils/cloudinary.util');
const { toCamelCaseObject } = require('../../utils/caseConverter');

/**
 * Kiểm tra quyền truy cập và trạng thái khóa học cho việc sửa đổi section/lesson.
 * @param {number} courseId - ID khóa học.
 * @param {object} user - User đang thao tác.
 * @param {string} action - Mô tả hành động (vd: "tạo chương").
 * @returns {Promise<object>} - Thông tin khóa học nếu hợp lệ.
 */
const checkCourseAccess = async (courseId, user, action) => {
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
      `Bạn không có quyền ${action} cho khóa học này.`
    );
  }

  if (
    !isAdmin &&
    ![CourseStatus.DRAFT, CourseStatus.REJECTED].includes(course.StatusID)
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Không thể ${action} khi khóa học không ở trạng thái ${CourseStatus.DRAFT} hoặc ${CourseStatus.REJECTED}.`
    );
  }
  return course;
};

/**
 * Tạo section mới cho khóa học.
 * @param {number} courseId
 * @param {object} sectionData - { sectionName, description }
 * @param {object} user - Người dùng tạo.
 * @returns {Promise<object>} - Section mới.
 */
const createSection = async (courseId, sectionData, user) => {
  await checkCourseAccess(courseId, user, 'tạo chương');

  const maxOrder = await sectionRepository.getMaxSectionOrder(courseId);
  const newOrder = maxOrder + 1;

  const newSectionData = {
    CourseID: courseId,
    SectionName: sectionData.sectionName,
    SectionOrder: sectionData.sectionOrder || newOrder,
    Description: sectionData.description,
  };

  const result = await sectionRepository.createSection(newSectionData);

  return toCamelCaseObject(result);
};

/**
 * Lấy tất cả sections của một khóa học.
 * Quyền xem đã được kiểm tra ở getCourseBySlug hoặc tương tự trước khi gọi hàm này.
 * @param {number} courseId
 * @returns {Promise<object[]>}
 */
const getSectionsByCourse = async (courseId) => {
  return sectionRepository.findSectionsByCourseId(courseId);
};

/**
 * Cập nhật section.
 * @param {number} sectionId
 * @param {object} updateBody - { sectionName, description }
 * @param {object} user - Người dùng cập nhật.
 * @returns {Promise<object>} - Section đã cập nhật.
 */
const updateSection = async (sectionId, updateBody, user) => {
  const section = await sectionRepository.findSectionById(sectionId);
  if (!section) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy chương.');
  }
  await checkCourseAccess(section.CourseID, user, 'cập nhật chương');

  const dataToUpdate = {
    SectionName: updateBody.sectionName,
    Description: updateBody.description,
  };
  Object.keys(dataToUpdate).forEach(
    (key) => dataToUpdate[key] === undefined && delete dataToUpdate[key]
  );

  if (Object.keys(dataToUpdate).length === 0) {
    return section;
  }

  const updatedSection = await sectionRepository.updateSectionById(
    sectionId,
    dataToUpdate
  );
  if (!updatedSection) {
    logger.warn(`Update section ${sectionId} returned null.`);
    return section;
  }
  return updatedSection;
};

/**
 * Xóa section.
 * @param {number} sectionId
 * @param {object} user - Người dùng xóa.
 * @returns {Promise<void>}
 */
const deleteSection = async (sectionId, user) => {
  const section = await sectionRepository.findSectionById(sectionId);
  if (!section) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy chương.');
  }
  await checkCourseAccess(section.CourseID, user, 'xóa chương');

  const lessons = await lessonRepository.findLessonsBySectionId(sectionId);

  for (const lesson of lessons) {
    if (lesson.ExternalVideoID) {
      try {
        await cloudinaryUtil.deleteAsset(lesson.ExternalVideoID, {
          resource_type: 'video',
        });
        logger.info(
          `Lesson video deleted from Cloudinary: ${lesson.ExternalVideoID} (during section delete)`
        );
      } catch (error) {
        logger.error(
          `Failed to delete lesson video ${lesson.ExternalVideoID} (during section delete):`,
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
            `Lesson attachment deleted from Cloudinary: ${attachment.CloudStorageID} (during section delete)`
          );
        } catch (error) {
          logger.error(
            `Failed to delete lesson attachment ${attachment.CloudStorageID} (during section delete):`,
            error
          );
        }
      }
    }
  }

  await sectionRepository.deleteSectionById(sectionId);
  logger.info(
    `Section ${sectionId} and associated DB records deleted by user ${user.id}`
  );
};

/**
 * Cập nhật thứ tự các sections của một khóa học.
 * @param {number} courseId
 * @param {Array<{id: number, order: number}>} sectionOrders - Mảng section và thứ tự mới.
 * @param {object} user - Người dùng thực hiện.
 * @returns {Promise<void>}
 */
const updateSectionsOrder = async (courseId, sectionOrders, user) => {
  await checkCourseAccess(courseId, user, 'sắp xếp chương');

  const currentSections =
    await sectionRepository.findSectionsByCourseId(courseId);
  const currentSectionIds = currentSections.map((s) => s.SectionID);
  const requestSectionIds = sectionOrders.map((s) => s.id);
  const requestOrders = sectionOrders.map((s) => s.order);

  if (!requestSectionIds.every((id) => currentSectionIds.includes(id))) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Danh sách chương không hợp lệ cho khóa học này.'
    );
  }
  if (
    requestSectionIds.length !== currentSectionIds.length ||
    !currentSectionIds.every((id) => requestSectionIds.includes(id))
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Yêu cầu phải bao gồm tất cả các chương của khóa học.'
    );
  }

  if (new Set(requestOrders).size !== requestOrders.length) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Thứ tự chương không được trùng lặp.'
    );
  }
  const sortedOrders = [...requestOrders].sort((a, b) => a - b);
  if (
    sortedOrders[0] !== 0 ||
    !sortedOrders.every((order, index) => order === index)
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Thứ tự chương phải liên tục và bắt đầu từ 0.'
    );
  }

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    await sectionRepository.updateSectionsOrder(sectionOrders, transaction);
    await transaction.commit();
    logger.info(
      `Sections order updated for course ${courseId} by user ${user.id}`
    );
  } catch (error) {
    logger.error(
      `Error updating sections order for course ${courseId}:`,
      error
    );
    await transaction.rollback();
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Cập nhật thứ tự chương thất bại.'
    );
  }
};

module.exports = {
  createSection,
  getSectionsByCourse,
  updateSection,
  deleteSection,
  updateSectionsOrder,
  checkCourseAccess,
};
