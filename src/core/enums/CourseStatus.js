const CourseStatus = Object.freeze({
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  PUBLISHED: 'PUBLISHED',
  REJECTED: 'REJECTED',
  ARCHIVED: 'ARCHIVED',
  // Có thể thêm DELETED cho xóa mềm
});

module.exports = CourseStatus;
