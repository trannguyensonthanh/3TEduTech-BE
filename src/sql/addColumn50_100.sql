USE ThreeTEduTechLMS;

GO PRINT 'Altering FileType column in LessonAttachments table...';

-- Kiểm tra xem bảng và cột có tồn tại không
IF EXISTS (
  SELECT
    1
  FROM
    INFORMATION_SCHEMA.COLUMNS
  WHERE
    TABLE_SCHEMA = 'dbo'
    AND TABLE_NAME = 'LessonAttachments'
    AND COLUMN_NAME = 'FileType'
) BEGIN
-- Kiểm tra kiểu dữ liệu hiện tại có phải là VARCHAR(50) không (để tránh chạy lại nếu đã đổi)
IF EXISTS (
  SELECT
    1
  FROM
    INFORMATION_SCHEMA.COLUMNS
  WHERE
    TABLE_SCHEMA = 'dbo'
    AND TABLE_NAME = 'LessonAttachments'
    AND COLUMN_NAME = 'FileType'
    AND DATA_TYPE = 'varchar'
    AND CHARACTER_MAXIMUM_LENGTH = 50
) BEGIN
-- Thay đổi kiểu dữ liệu của cột
ALTER TABLE dbo.LessonAttachments
ALTER COLUMN FileType VARCHAR(100) NULL;

-- Giữ NULLable
PRINT 'FileType column altered to VARCHAR(100) successfully.';

END ELSE IF EXISTS (
  SELECT
    1
  FROM
    INFORMATION_SCHEMA.COLUMNS
  WHERE
    TABLE_SCHEMA = 'dbo'
    AND TABLE_NAME = 'LessonAttachments'
    AND COLUMN_NAME = 'FileType'
    AND DATA_TYPE = 'varchar'
    AND CHARACTER_MAXIMUM_LENGTH = 100
) BEGIN PRINT 'FileType column is already VARCHAR(100). No changes made.';

END ELSE BEGIN PRINT 'FileType column exists but is not VARCHAR(50). Manual check required.';

-- Có thể thêm lệnh ALTER nếu bạn biết chắc kiểu dữ liệu hiện tại là gì và muốn đổi thành VARCHAR(100)
-- Ví dụ: ALTER TABLE dbo.LessonAttachments ALTER COLUMN FileType VARCHAR(100) NULL;
END END ELSE BEGIN PRINT 'Table LessonAttachments or column FileType does not exist.';

END GO
-- Kiểm tra lại cấu trúc sau khi chạy
-- EXEC sp_help 'dbo.LessonAttachments';
-- GO