USE ThreeTEduTechLMS;

GO PRINT 'Updating Lessons table structure for video source...';

-- Thêm cột VideoSourceType
IF COL_LENGTH ('dbo.Lessons', 'VideoSourceType') IS NULL BEGIN
ALTER TABLE dbo.Lessons ADD VideoSourceType VARCHAR(20) NULL;

ALTER TABLE dbo.Lessons ADD CONSTRAINT CK_Lessons_VideoSourceType CHECK (
  VideoSourceType IN ('CLOUDINARY', 'YOUTUBE', 'VIMEO')
);

PRINT 'Column VideoSourceType added with CHECK constraint.';

END ELSE BEGIN
-- Đảm bảo constraint đúng (nếu cột đã tồn tại từ lần thử trước)
IF NOT EXISTS (
  SELECT
    1
  FROM
    sys.check_constraints
  WHERE
    name = 'CK_Lessons_VideoSourceType'
) BEGIN
ALTER TABLE dbo.Lessons ADD CONSTRAINT CK_Lessons_VideoSourceType CHECK (
  VideoSourceType IN ('CLOUDINARY', 'YOUTUBE', 'VIMEO')
);

PRINT 'CHECK constraint CK_Lessons_VideoSourceType added.';

END END GO
-- Đổi tên hoặc đảm bảo ExternalVideoID tồn tại (nếu đã xóa nhầm)
IF COL_LENGTH ('dbo.Lessons', 'ExternalVideoID') IS NULL
AND COL_LENGTH ('dbo.Lessons', 'VideoPublicId') IS NOT NULL BEGIN
-- Nếu đã tạo VideoPublicId và xóa ExternalVideoID, đổi tên VideoPublicId thành ExternalVideoID
EXEC sp_rename 'dbo.Lessons.VideoPublicId',
'ExternalVideoID',
'COLUMN';

PRINT 'Renamed VideoPublicId to ExternalVideoID.';

END ELSE IF COL_LENGTH ('dbo.Lessons', 'ExternalVideoID') IS NULL
AND COL_LENGTH ('dbo.Lessons', 'VideoPublicId') IS NULL BEGIN
-- Nếu cả hai đều không có, thêm lại ExternalVideoID
ALTER TABLE dbo.Lessons ADD ExternalVideoID VARCHAR(255) NULL;

PRINT 'Column ExternalVideoID added.';

END GO
-- Xóa cột VideoUrl nếu tồn tại
IF COL_LENGTH ('dbo.Lessons', 'VideoUrl') IS NOT NULL BEGIN
ALTER TABLE dbo.Lessons
DROP COLUMN VideoUrl;

PRINT 'Column VideoUrl dropped.';

END GO
-- Xóa cột VideoPublicId nếu tồn tại và khác ExternalVideoID (trường hợp đổi tên ở trên không xảy ra)
IF COL_LENGTH ('dbo.Lessons', 'VideoPublicId') IS NOT NULL
AND OBJECT_ID ('dbo.Lessons.VideoPublicId', 'C') IS NOT NULL BEGIN
ALTER TABLE dbo.Lessons
DROP COLUMN VideoPublicId;

PRINT 'Column VideoPublicId dropped.';

END GO
-- (Quan trọng) Cập nhật dữ liệu cũ nếu có:
-- Cần xác định logic để chuyển đổi dữ liệu từ VideoUrl/ExternalVideoID cũ sang cấu trúc mới.
-- Ví dụ đơn giản: Nếu VideoUrl cũ chứa youtube.com -> đặt Type=YOUTUBE, Data=videoId
-- Nếu VideoPublicId cũ có giá trị -> đặt Type=CLOUDINARY, Data=publicId
-- Cần viết script migrate dữ liệu riêng nếu cần giữ lại video cũ.
PRINT 'Lesson table structure updated. Manual data migration might be needed for existing records.';

GO