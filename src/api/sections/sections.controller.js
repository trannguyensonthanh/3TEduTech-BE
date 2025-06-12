const httpStatus = require('http-status').status;
const sectionService = require('./sections.service');
const { catchAsync } = require('../../utils/catchAsync');

// Tạo section mới
const createSection = catchAsync(async (req, res) => {
  const section = await sectionService.createSection(
    req.params.courseId,
    req.body,
    req.user
  );
  res.status(httpStatus.CREATED).send(section);
});

// Lấy danh sách sections theo course
const getSections = catchAsync(async (req, res) => {
  const sections = await sectionService.getSectionsByCourse(
    req.params.courseId
  );
  res.status(httpStatus.OK).send({ sections });
});

// Cập nhật section
const updateSection = catchAsync(async (req, res) => {
  const section = await sectionService.updateSection(
    req.params.sectionId,
    req.body,
    req.user
  );
  res.status(httpStatus.OK).send(section);
});

// Xóa section
const deleteSection = catchAsync(async (req, res) => {
  await sectionService.deleteSection(req.params.sectionId, req.user);
  res.status(httpStatus.NO_CONTENT).send();
});

// Cập nhật thứ tự sections
const updateSectionsOrder = catchAsync(async (req, res) => {
  await sectionService.updateSectionsOrder(
    req.params.courseId,
    req.body,
    req.user
  );
  const updatedSections = await sectionService.getSectionsByCourse(
    req.params.courseId
  );
  res.status(httpStatus.OK).send({ sections: updatedSections });
});

module.exports = {
  createSection,
  getSections,
  updateSection,
  deleteSection,
  updateSectionsOrder,
};
