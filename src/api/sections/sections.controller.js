const httpStatus = require('http-status').status;
const sectionService = require('./sections.service');
const { catchAsync } = require('../../utils/catchAsync');

const createSection = catchAsync(async (req, res) => {
  const section = await sectionService.createSection(
    req.params.courseId,
    req.body,
    req.user
  );
  res.status(httpStatus.CREATED).send(section);
});

// Lưu ý: Route lấy sections thường được tích hợp vào Get Course Detail
// Tạm thời vẫn tạo controller nếu cần gọi API riêng
const getSections = catchAsync(async (req, res) => {
  // Cần kiểm tra quyền xem courseId trước khi gọi service ở đây nếu route là public/user
  // const course = await courseService.checkCourseAccessForRead(req.params.courseId, req.user); // Hàm này cần tạo
  const sections = await sectionService.getSectionsByCourse(
    req.params.courseId
  );
  res.status(httpStatus.OK).send({ sections });
});

const updateSection = catchAsync(async (req, res) => {
  const section = await sectionService.updateSection(
    req.params.sectionId,
    req.body,
    req.user
  );
  res.status(httpStatus.OK).send(section);
});

const deleteSection = catchAsync(async (req, res) => {
  await sectionService.deleteSection(req.params.sectionId, req.user);
  res.status(httpStatus.NO_CONTENT).send();
});

const updateSectionsOrder = catchAsync(async (req, res) => {
  await sectionService.updateSectionsOrder(
    req.params.courseId,
    req.body,
    req.user
  );
  // Lấy lại danh sách đã sắp xếp để trả về (tùy chọn)
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
