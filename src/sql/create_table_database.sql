-- ============================================================================
-- Script to create the ThreeTEduTechLMS database and its tables
-- Database Name: ThreeTEduTechLMS
-- ============================================================================
-- Switch to master database to ensure the target database can be created/dropped
USE master;

GO
-- Drop the database if it already exists (optional, use with caution in non-dev environments)
IF DB_ID ('ThreeTEduTechLMS') IS NOT NULL BEGIN
ALTER DATABASE ThreeTEduTechLMS
SET
  SINGLE_USER
WITH
  ROLLBACK IMMEDIATE;

DROP DATABASE ThreeTEduTechLMS;

PRINT 'Database ThreeTEduTechLMS dropped.';

END GO
-- Create the new database with Vietnamese collation for proper sorting/comparison
CREATE DATABASE ThreeTEduTechLMS COLLATE Vietnamese_CI_AS;

PRINT 'Database ThreeTEduTechLMS created.';

GO
-- Switch to the newly created database context
USE ThreeTEduTechLMS;

GO
-- ============================================================================
-- 1. Table: Roles
-- ============================================================================
PRINT 'Creating Table: Roles...';

CREATE TABLE
  Roles (
    RoleID VARCHAR(10) NOT NULL,
    RoleName NVARCHAR (100) NOT NULL,
    Description NVARCHAR (500) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT PK_Roles PRIMARY KEY (RoleID)
  );

GO
-- Seed basic roles
INSERT INTO
  Roles (RoleID, RoleName, Description)
VALUES
  (
    'STUDENT',
    N'Học viên',
    N'Người dùng đăng ký học các khóa học'
  ),
  (
    'INSTRUCTOR',
    N'Giảng viên',
    N'Người dùng tạo và quản lý khóa học'
  ),
  (
    'ADMIN',
    N'Quản trị viên',
    N'Quản trị hệ thống (nội dung, người dùng)'
  ),
  (
    'SUPERADMIN',
    N'Super Admin',
    N'Quản trị cấp cao nhất'
  );

PRINT 'Roles table created and seeded.';

GO
-- ============================================================================
-- 2. Table: Accounts
-- ============================================================================
PRINT 'Creating Table: Accounts...';

CREATE TABLE
  Accounts (
    AccountID BIGINT IDENTITY (1, 1) NOT NULL,
    Email VARCHAR(255) NOT NULL,
    HashedPassword VARCHAR(255) NULL, -- Allow NULL for social login
    RoleID VARCHAR(10) NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'PENDING_VERIFICATION',
    EmailVerificationToken VARCHAR(128) NULL,
    EmailVerificationExpires DATETIME2 NULL,
    PasswordResetToken VARCHAR(128) NULL,
    PasswordResetExpires DATETIME2 NULL,
    HasSocialLogin BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT PK_Accounts PRIMARY KEY (AccountID),
    CONSTRAINT FK_Accounts_RoleID FOREIGN KEY (RoleID) REFERENCES Roles (RoleID) ON UPDATE NO ACTION -- Prevent updating RoleID if referenced
    ON DELETE NO ACTION, -- Prevent deleting Role if referenced by active accounts
    CONSTRAINT UQ_Accounts_Email UNIQUE (Email),
    CONSTRAINT CK_Accounts_Status CHECK (
      Status IN (
        'ACTIVE',
        'INACTIVE',
        'BANNED',
        'PENDING_VERIFICATION'
      )
    )
  );

GO
-- Add Indexes for Accounts
CREATE INDEX IX_Accounts_Email ON Accounts (Email);

CREATE INDEX IX_Accounts_RoleID ON Accounts (RoleID);

CREATE INDEX IX_Accounts_Status ON Accounts (Status);

-- Filtered indexes for tokens (only index non-NULL values)
CREATE INDEX IX_Accounts_EmailVerificationToken ON Accounts (EmailVerificationToken)
WHERE
  EmailVerificationToken IS NOT NULL;

CREATE INDEX IX_Accounts_PasswordResetToken ON Accounts (PasswordResetToken)
WHERE
  PasswordResetToken IS NOT NULL;

PRINT 'Accounts table created with constraints and indexes.';

GO
-- ============================================================================
-- 3. Table: AuthMethods
-- ============================================================================
PRINT 'Creating Table: AuthMethods...';

CREATE TABLE
  AuthMethods (
    AuthMethodID BIGINT IDENTITY (1, 1) NOT NULL,
    AccountID BIGINT NOT NULL,
    LoginType VARCHAR(20) NOT NULL, -- 'EMAIL', 'GOOGLE', 'FACEBOOK'
    ExternalID VARCHAR(255) NULL, -- ID from Google/Facebook
    CONSTRAINT PK_AuthMethods PRIMARY KEY (AuthMethodID),
    CONSTRAINT FK_AuthMethods_AccountID FOREIGN KEY (AccountID) REFERENCES Accounts (AccountID) ON DELETE CASCADE, -- Delete auth methods if account is deleted
    CONSTRAINT CK_AuthMethods_LoginType CHECK (LoginType IN ('EMAIL', 'GOOGLE', 'FACEBOOK')),
    CONSTRAINT UQ_AuthMethods_Account_LoginType UNIQUE (AccountID, LoginType) -- An account can only link one type once
  );

GO
-- Add Indexes for AuthMethods
CREATE INDEX IX_AuthMethods_AccountID ON AuthMethods (AccountID);

CREATE INDEX IX_AuthMethods_LoginType ON AuthMethods (LoginType);

CREATE INDEX IX_AuthMethods_ExternalID ON AuthMethods (ExternalID)
WHERE
  ExternalID IS NOT NULL;

PRINT 'AuthMethods table created.';

GO
-- ============================================================================
-- 4. Table: UserProfiles
-- ============================================================================
PRINT 'Creating Table: UserProfiles...';

CREATE TABLE
  UserProfiles (
    AccountID BIGINT NOT NULL,
    FullName NVARCHAR (150) NOT NULL,
    AvatarUrl VARCHAR(500) NULL,
    CoverImageUrl VARCHAR(500) NULL,
    Gender VARCHAR(10) NULL, -- 'MALE', 'FEMALE', 'OTHER'
    BirthDate DATE NULL,
    PhoneNumber VARCHAR(20) NULL,
    Headline NVARCHAR (255) NULL, -- Short bio/title
    Location NVARCHAR (255) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT PK_UserProfiles PRIMARY KEY (AccountID),
    CONSTRAINT FK_UserProfiles_AccountID FOREIGN KEY (AccountID) REFERENCES Accounts (AccountID) ON DELETE CASCADE, -- Delete profile if account is deleted
    CONSTRAINT CK_UserProfiles_Gender CHECK (Gender IN ('MALE', 'FEMALE', 'OTHER')), -- Added 'OTHER'
    CONSTRAINT UQ_UserProfiles_PhoneNumber UNIQUE (PhoneNumber)
    WHERE
      PhoneNumber IS NOT NULL -- Unique phone numbers, ignore NULLs
  );

GO
-- Add Indexes for UserProfiles
CREATE INDEX IX_UserProfiles_PhoneNumber ON UserProfiles (PhoneNumber)
WHERE
  PhoneNumber IS NOT NULL;

PRINT 'UserProfiles table created.';

GO
-- ============================================================================
-- 5. Table: Skills
-- ============================================================================
PRINT 'Creating Table: Skills...';

CREATE TABLE
  Skills (
    SkillID INT IDENTITY (1, 1) NOT NULL,
    SkillName NVARCHAR (100) NOT NULL,
    Description NVARCHAR (500) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT PK_Skills PRIMARY KEY (SkillID),
    CONSTRAINT UQ_Skills_SkillName UNIQUE (SkillName)
  );

PRINT 'Skills table created.';

GO
-- ============================================================================
-- 6. Table: InstructorSkills
-- ============================================================================
PRINT 'Creating Table: InstructorSkills...';

CREATE TABLE
  InstructorSkills (
    InstructorSkillID BIGINT IDENTITY (1, 1) NOT NULL,
    AccountID BIGINT NOT NULL, -- Refers to an Account with RoleID = 'INSTRUCTOR'
    SkillID INT NOT NULL,
    CONSTRAINT PK_InstructorSkills PRIMARY KEY (InstructorSkillID),
    CONSTRAINT FK_InstructorSkills_AccountID FOREIGN KEY (AccountID) REFERENCES Accounts (AccountID) ON DELETE NO ACTION, -- Keep record if instructor account deleted? Or Cascade? User specified NO ACTION.
    CONSTRAINT FK_InstructorSkills_SkillID FOREIGN KEY (SkillID) REFERENCES Skills (SkillID) ON DELETE NO ACTION, -- Keep record if skill deleted? Or Cascade? User specified NO ACTION.
    CONSTRAINT UQ_InstructorSkills_Account_Skill UNIQUE (AccountID, SkillID)
  );

PRINT 'InstructorSkills table created.';

GO
-- ============================================================================
-- 7. Table: InstructorProfiles
-- ============================================================================
PRINT 'Creating Table: InstructorProfiles...';

CREATE TABLE
  InstructorProfiles (
    AccountID BIGINT NOT NULL, -- Refers to an Account with RoleID = 'INSTRUCTOR'
    ProfessionalTitle NVARCHAR (255) NULL,
    Bio NVARCHAR (MAX) NULL, -- Longer description
    AboutMe NVARCHAR (MAX) NULL, -- Can store HTML content
    -- Payment Information (Consider encryption at application level for BankAccountNumber)
    BankAccountNumber VARCHAR(50) NULL,
    BankName NVARCHAR (100) NULL,
    BankAccountHolderName NVARCHAR (150) NULL,
    LastBalanceUpdate DATETIME2 NULL, -- When the instructor's earnings balance was last calculated/updated
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT PK_InstructorProfiles PRIMARY KEY (AccountID),
    CONSTRAINT FK_InstructorProfiles_AccountID FOREIGN KEY (AccountID) REFERENCES Accounts (AccountID) ON DELETE CASCADE -- Delete instructor profile if account is deleted
  );

PRINT 'InstructorProfiles table created.';

GO
-- ============================================================================
-- 8. Table: InstructorSocialLinks
-- ============================================================================
PRINT 'Creating Table: InstructorSocialLinks...';

CREATE TABLE
  InstructorSocialLinks (
    SocialLinkID BIGINT IDENTITY (1, 1) NOT NULL,
    AccountID BIGINT NOT NULL, -- Refers to an Account with RoleID = 'INSTRUCTOR'
    Platform VARCHAR(50) NOT NULL, -- e.g., 'LINKEDIN', 'GITHUB', 'PERSONAL_WEBSITE', 'YOUTUBE'
    Url NVARCHAR (MAX) NOT NULL, -- Use NVARCHAR(MAX) for potentially long URLs
    CONSTRAINT PK_InstructorSocialLinks PRIMARY KEY (SocialLinkID),
    CONSTRAINT FK_InstructorSocialLinks_AccountID FOREIGN KEY (AccountID) REFERENCES Accounts (AccountID) ON DELETE CASCADE,
    CONSTRAINT UQ_InstructorSocialLinks_Account_Platform UNIQUE (AccountID, Platform)
  );

PRINT 'InstructorSocialLinks table created.';

GO
-- ============================================================================
-- 9. Table: Categories
-- ============================================================================
PRINT 'Creating Table: Categories...';

CREATE TABLE
  Categories (
    CategoryID INT IDENTITY (1, 1) NOT NULL,
    CategoryName NVARCHAR (150) NOT NULL,
    Slug VARCHAR(150) NOT NULL, -- URL-friendly identifier
    Description NVARCHAR (500) NULL,
    IconUrl VARCHAR(500) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT PK_Categories PRIMARY KEY (CategoryID),
    CONSTRAINT UQ_Categories_CategoryName UNIQUE (CategoryName),
    CONSTRAINT UQ_Categories_Slug UNIQUE (Slug)
  );

GO
-- Add Index for Categories
CREATE INDEX IX_Categories_Slug ON Categories (Slug);

PRINT 'Categories table created.';

GO
-- ============================================================================
-- 10. Table: Levels
-- ============================================================================
PRINT 'Creating Table: Levels...';

CREATE TABLE
  Levels (
    LevelID INT IDENTITY (1, 1) NOT NULL,
    LevelName NVARCHAR (100) NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT PK_Levels PRIMARY KEY (LevelID),
    CONSTRAINT UQ_Levels_LevelName UNIQUE (LevelName)
  );

GO
-- Seed basic levels
INSERT INTO
  Levels (LevelName)
VALUES
  (N'Cơ bản'),
  (N'Trung cấp'),
  (N'Nâng cao'),
  (N'Mọi cấp độ');

PRINT 'Levels table created and seeded.';

GO
-- ============================================================================
-- 11. Table: CourseStatuses
-- ============================================================================
PRINT 'Creating Table: CourseStatuses...';

CREATE TABLE
  CourseStatuses (
    StatusID VARCHAR(20) NOT NULL, -- e.g., 'DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'ARCHIVED'
    StatusName NVARCHAR (100) NOT NULL,
    Description NVARCHAR (255) NULL,
    CONSTRAINT PK_CourseStatuses PRIMARY KEY (StatusID)
  );

GO
-- Seed course statuses
INSERT INTO
  CourseStatuses (StatusID, StatusName, Description)
VALUES
  (
    'DRAFT',
    N'Bản nháp',
    N'Khóa học đang được soạn thảo, chưa gửi duyệt'
  ),
  (
    'PENDING',
    N'Chờ duyệt',
    N'Khóa học đã được gửi và đang chờ quản trị viên phê duyệt'
  ),
  (
    'PUBLISHED',
    N'Đã xuất bản',
    N'Khóa học đã được phê duyệt và hiển thị công khai'
  ),
  (
    'REJECTED',
    N'Bị từ chối',
    N'Khóa học bị từ chối phê duyệt'
  ),
  (
    'ARCHIVED',
    N'Đã lưu trữ',
    N'Khóa học không còn hiển thị công khai nhưng vẫn được lưu trữ'
  );

PRINT 'CourseStatuses table created and seeded.';

GO
-- ============================================================================
-- 12. Table: Courses
-- ============================================================================
PRINT 'Creating Table: Courses...';

CREATE TABLE
  Courses (
    CourseID BIGINT IDENTITY (1, 1) NOT NULL,
    CourseName NVARCHAR (500) NOT NULL,
    Slug NVARCHAR (500) NOT NULL, -- URL-friendly, should be unique across published courses
    ShortDescription NVARCHAR (500) NOT NULL,
    FullDescription NVARCHAR (MAX) NOT NULL,
    Requirements NVARCHAR (MAX) NULL, -- What students need before starting
    LearningOutcomes NVARCHAR (MAX) NULL, -- What students will achieve
    ThumbnailUrl VARCHAR(MAX) NULL,
    IntroVideoUrl VARCHAR(MAX) NULL,
    OriginalPrice DECIMAL(18, 4) NOT NULL,
    DiscountedPrice DECIMAL(18, 4) NULL, -- NULL if no discount
    InstructorID BIGINT NOT NULL, -- FK to Accounts (Role='INSTRUCTOR')
    CategoryID INT NOT NULL, -- FK to Categories
    LevelID INT NOT NULL, -- FK to Levels
    Language VARCHAR(10) NOT NULL DEFAULT 'vi', -- e.g., 'vi', 'en'
    StatusID VARCHAR(20) NOT NULL DEFAULT 'DRAFT', -- FK to CourseStatuses
    PublishedAt DATETIME2 NULL, -- Timestamp when status became 'PUBLISHED'
    IsFeatured BIT NOT NULL DEFAULT 0, -- Flag for featured courses
    LiveCourseID BIGINT NULL, -- For draft/editing flow, points to the currently published version
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT PK_Courses PRIMARY KEY (CourseID),
    CONSTRAINT FK_Courses_InstructorID FOREIGN KEY (InstructorID) REFERENCES Accounts (AccountID) ON DELETE NO ACTION, -- Keep course if instructor leaves? Or SET NULL? NO ACTION for now.
    CONSTRAINT FK_Courses_CategoryID FOREIGN KEY (CategoryID) REFERENCES Categories (CategoryID) ON DELETE RESTRICT, -- Prevent deleting category if courses use it
    CONSTRAINT FK_Courses_LevelID FOREIGN KEY (LevelID) REFERENCES Levels (LevelID) ON DELETE RESTRICT, -- Prevent deleting level if courses use it
    CONSTRAINT FK_Courses_StatusID FOREIGN KEY (StatusID) REFERENCES CourseStatuses (StatusID) ON DELETE NO ACTION,
    CONSTRAINT FK_Courses_LiveCourseID FOREIGN KEY (LiveCourseID) REFERENCES Courses (CourseID) ON DELETE NO ACTION, -- Self-reference, do not cascade
    CONSTRAINT UQ_Courses_Slug UNIQUE (Slug), -- Ensure slugs are unique
    CONSTRAINT CK_Courses_OriginalPrice CHECK (OriginalPrice >= 0),
    CONSTRAINT CK_Courses_DiscountedPrice CHECK (
      DiscountedPrice IS NULL
      OR (
        DiscountedPrice >= 0
        AND DiscountedPrice <= OriginalPrice
      )
    ) -- Discounted price must be non-negative and <= original
  );

GO
-- Add Indexes for Courses
CREATE INDEX IX_Courses_CourseName ON Courses (CourseName);

-- Consider FULLTEXT index later
CREATE INDEX IX_Courses_Slug ON Courses (Slug);

CREATE INDEX IX_Courses_InstructorID ON Courses (InstructorID);

CREATE INDEX IX_Courses_CategoryID ON Courses (CategoryID);

CREATE INDEX IX_Courses_LevelID ON Courses (LevelID);

CREATE INDEX IX_Courses_StatusID ON Courses (StatusID);

CREATE INDEX IX_Courses_IsFeatured ON Courses (IsFeatured) INCLUDE (
  CourseName,
  ThumbnailUrl,
  OriginalPrice,
  DiscountedPrice
);

-- Covering index example
CREATE INDEX IX_Courses_LiveCourseID ON Courses (LiveCourseID)
WHERE
  LiveCourseID IS NOT NULL;

PRINT 'Courses table created.';

GO
-- ============================================================================
-- 13. Table: Carts
-- ============================================================================
PRINT 'Creating Table: Carts...';

CREATE TABLE
  Carts (
    CartID BIGINT IDENTITY (1, 1) NOT NULL,
    AccountID BIGINT NOT NULL, -- Each active user (student) has one cart
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT PK_Carts PRIMARY KEY (CartID),
    CONSTRAINT FK_Carts_AccountID FOREIGN KEY (AccountID) REFERENCES Accounts (AccountID) ON DELETE CASCADE, -- Delete cart if user is deleted
    CONSTRAINT UQ_Carts_AccountID UNIQUE (AccountID) -- Ensure one cart per user
  );

PRINT 'Carts table created.';

GO
-- ============================================================================
-- 14. Table: CartItems
-- ============================================================================
PRINT 'Creating Table: CartItems...';

CREATE TABLE
  CartItems (
    CartItemID BIGINT IDENTITY (1, 1) NOT NULL,
    CartID BIGINT NOT NULL,
    CourseID BIGINT NOT NULL,
    PriceAtAddition DECIMAL(18, 4) NOT NULL, -- Price when item was added (original or discounted)
    AddedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT PK_CartItems PRIMARY KEY (CartItemID),
    CONSTRAINT FK_CartItems_CartID FOREIGN KEY (CartID) REFERENCES Carts (CartID) ON DELETE CASCADE, -- Delete items if cart is deleted
    CONSTRAINT FK_CartItems_CourseID FOREIGN KEY (CourseID) REFERENCES Courses (CourseID) ON DELETE CASCADE, -- Delete item if course is deleted (or NO ACTION if you want to keep history differently)
    CONSTRAINT UQ_CartItems_Cart_Course UNIQUE (CartID, CourseID) -- A course can only be in a specific cart once
  );

GO
-- Add Index for CartItems
CREATE INDEX IX_CartItems_CartID ON CartItems (CartID);

CREATE INDEX IX_CartItems_CourseID ON CartItems (CourseID);

PRINT 'CartItems table created.';

GO
-- ============================================================================
-- 15. Table: Sections
-- ============================================================================
PRINT 'Creating Table: Sections...';

CREATE TABLE
  Sections (
    SectionID BIGINT IDENTITY (1, 1) NOT NULL,
    CourseID BIGINT NOT NULL,
    SectionName NVARCHAR (255) NOT NULL,
    SectionOrder INT NOT NULL DEFAULT 0, -- Order within the course
    Description NVARCHAR (MAX) NULL,
    OriginalID BIGINT NULL, -- Used for draft/live course versioning if needed
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT PK_Sections PRIMARY KEY (SectionID),
    CONSTRAINT FK_Sections_CourseID FOREIGN KEY (CourseID) REFERENCES Courses (CourseID) ON DELETE CASCADE, -- Delete sections if course is deleted
    CONSTRAINT FK_Sections_OriginalID FOREIGN KEY (OriginalID) REFERENCES Sections (SectionID) ON DELETE NO ACTION -- Self-ref, do not cascade
  );

GO
-- Add Indexes for Sections
CREATE INDEX IX_Sections_CourseID_Order ON Sections (CourseID, SectionOrder);

CREATE INDEX IX_Sections_OriginalID ON Sections (OriginalID)
WHERE
  OriginalID IS NOT NULL;

PRINT 'Sections table created.';

GO
-- ============================================================================
-- 16. Table: Lessons
-- ============================================================================
PRINT 'Creating Table: Lessons...';

CREATE TABLE
  Lessons (
    LessonID BIGINT IDENTITY (1, 1) NOT NULL,
    SectionID BIGINT NOT NULL,
    LessonName NVARCHAR (255) NOT NULL,
    Description NVARCHAR (MAX) NULL,
    LessonOrder INT NOT NULL DEFAULT 0, -- Order within the section
    LessonType VARCHAR(20) NOT NULL, -- 'VIDEO', 'TEXT', 'QUIZ'
    VideoUrl VARCHAR(MAX) NULL, -- URL for video file or stream
    ExternalVideoID VARCHAR(255) NULL, -- e.g., YouTube, Vimeo ID
    ThumbnailUrl VARCHAR(500) NULL, -- Thumbnail for video lesson
    VideoDurationSeconds INT NULL, -- Duration in seconds
    TextContent NVARCHAR (MAX) NULL, -- Content for text lessons
    IsFreePreview BIT NOT NULL DEFAULT 0, -- Can non-enrolled users view this?
    OriginalID BIGINT NULL, -- Used for draft/live course versioning if needed
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT PK_Lessons PRIMARY KEY (LessonID),
    CONSTRAINT FK_Lessons_SectionID FOREIGN KEY (SectionID) REFERENCES Sections (SectionID) ON DELETE CASCADE, -- Delete lessons if section is deleted
    CONSTRAINT FK_Lessons_OriginalID FOREIGN KEY (OriginalID) REFERENCES Lessons (LessonID) ON DELETE NO ACTION, -- Self-ref, do not cascade
    CONSTRAINT CK_Lessons_LessonType CHECK (LessonType IN ('VIDEO', 'TEXT', 'QUIZ')),
    CONSTRAINT CK_Lessons_VideoDurationSeconds CHECK (
      VideoDurationSeconds IS NULL
      OR VideoDurationSeconds >= 0
    )
  );

GO
-- Add Indexes for Lessons
CREATE INDEX IX_Lessons_SectionID_Order ON Lessons (SectionID, LessonOrder);

CREATE INDEX IX_Lessons_OriginalID ON Lessons (OriginalID)
WHERE
  OriginalID IS NOT NULL;

CREATE INDEX IX_Lessons_LessonType ON Lessons (LessonType);

PRINT 'Lessons table created.';

GO
-- ============================================================================
-- 17. Table: LessonAttachments
-- ============================================================================
PRINT 'Creating Table: LessonAttachments...';

CREATE TABLE
  LessonAttachments (
    AttachmentID INT IDENTITY (1, 1) NOT NULL,
    LessonID BIGINT NOT NULL,
    FileName NVARCHAR (255) NOT NULL, -- Display name for the file
    FileURL VARCHAR(MAX) NOT NULL, -- URL to download (e.g., Cloudinary, S3, R2)
    FileType VARCHAR(50) NULL, -- e.g., 'pdf', 'zip', 'docx'
    FileSize BIGINT NULL, -- Size in bytes
    CloudStorageID VARCHAR(255) NULL, -- ID on cloud storage for deletion management
    UploadedAt DATETIME2 NOT NULL DEFAULT GETDATE (), -- Use NOT NULL for default
    CONSTRAINT PK_LessonAttachments PRIMARY KEY (AttachmentID),
    CONSTRAINT FK_LessonAttachments_LessonID FOREIGN KEY (LessonID) REFERENCES Lessons (LessonID) ON DELETE CASCADE -- Delete attachments if lesson is deleted
  );

GO
-- Add Index for LessonAttachments
CREATE INDEX IX_LessonAttachments_LessonID ON LessonAttachments (LessonID);

PRINT 'LessonAttachments table created.';

GO
-- ============================================================================
-- 18. Table: QuizQuestions
-- ============================================================================
PRINT 'Creating Table: QuizQuestions...';

CREATE TABLE
  QuizQuestions (
    QuestionID INT IDENTITY (1, 1) NOT NULL,
    LessonID BIGINT NOT NULL, -- Links to a Lesson with LessonType='QUIZ'
    QuestionText NVARCHAR (MAX) NOT NULL,
    Explanation NVARCHAR (MAX) NULL, -- Explanation shown after attempting
    QuestionOrder INT NOT NULL DEFAULT 0, -- Order within the quiz lesson
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT PK_QuizQuestions PRIMARY KEY (QuestionID),
    CONSTRAINT FK_QuizQuestions_LessonID FOREIGN KEY (LessonID) REFERENCES Lessons (LessonID) ON DELETE CASCADE -- Delete questions if quiz lesson is deleted
  );

GO
-- Add Index for QuizQuestions
CREATE INDEX IX_QuizQuestions_LessonID_Order ON QuizQuestions (LessonID, QuestionOrder);

PRINT 'QuizQuestions table created.';

GO
-- ============================================================================
-- 19. Table: QuizOptions
-- ============================================================================
PRINT 'Creating Table: QuizOptions...';

CREATE TABLE
  QuizOptions (
    OptionID BIGINT IDENTITY (1, 1) NOT NULL,
    QuestionID INT NOT NULL,
    OptionText NVARCHAR (MAX) NOT NULL,
    IsCorrectAnswer BIT NOT NULL DEFAULT 0, -- Flag for the correct answer(s)
    OptionOrder INT NOT NULL DEFAULT 0, -- Display order (A, B, C...)
    CONSTRAINT PK_QuizOptions PRIMARY KEY (OptionID),
    CONSTRAINT FK_QuizOptions_QuestionID FOREIGN KEY (QuestionID) REFERENCES QuizQuestions (QuestionID) ON DELETE CASCADE -- Delete options if question is deleted
  );

GO
-- Add Index for QuizOptions
CREATE INDEX IX_QuizOptions_QuestionID ON QuizOptions (QuestionID);

PRINT 'QuizOptions table created.';

GO
-- ============================================================================
-- 20. Table: QuizAttempts
-- ============================================================================
PRINT 'Creating Table: QuizAttempts...';

CREATE TABLE
  QuizAttempts (
    AttemptID BIGINT IDENTITY (1, 1) NOT NULL,
    LessonID BIGINT NOT NULL, -- FK to Lesson (Type='QUIZ')
    AccountID BIGINT NOT NULL, -- FK to Account (Student)
    StartedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    CompletedAt DATETIME2 NULL, -- When the attempt was finished
    Score DECIMAL(5, 2) NULL, -- Score (e.g., percentage 0.00 to 100.00)
    IsPassed BIT NULL, -- Based on a predefined threshold
    AttemptNumber INT NOT NULL DEFAULT 1, -- Allows multiple attempts
    CONSTRAINT PK_QuizAttempts PRIMARY KEY (AttemptID),
    CONSTRAINT FK_QuizAttempts_LessonID FOREIGN KEY (LessonID) REFERENCES Lessons (LessonID) ON DELETE CASCADE,
    CONSTRAINT FK_QuizAttempts_AccountID FOREIGN KEY (AccountID) REFERENCES Accounts (AccountID) ON DELETE CASCADE,
    CONSTRAINT UQ_QuizAttempts_Lesson_Account_Number UNIQUE (LessonID, AccountID, AttemptNumber) -- Unique combination for attempts
  );

GO
-- Add Index for QuizAttempts
CREATE INDEX IX_QuizAttempts_AccountID_LessonID ON QuizAttempts (AccountID, LessonID);

PRINT 'QuizAttempts table created.';

GO
-- ============================================================================
-- 21. Table: QuizAttemptAnswers
-- ============================================================================
PRINT 'Creating Table: QuizAttemptAnswers...';

CREATE TABLE
  QuizAttemptAnswers (
    AttemptAnswerID BIGINT IDENTITY (1, 1) NOT NULL,
    AttemptID BIGINT NOT NULL,
    QuestionID INT NOT NULL,
    SelectedOptionID BIGINT NULL, -- The option chosen by the student
    IsCorrect BIT NULL, -- Calculated result (True/False)
    CONSTRAINT PK_QuizAttemptAnswers PRIMARY KEY (AttemptAnswerID),
    CONSTRAINT FK_QuizAttemptAnswers_AttemptID FOREIGN KEY (AttemptID) REFERENCES QuizAttempts (AttemptID) ON DELETE CASCADE, -- Delete answers if attempt is deleted
    CONSTRAINT FK_QuizAttemptAnswers_QuestionID FOREIGN KEY (QuestionID) REFERENCES QuizQuestions (QuestionID) ON DELETE NO ACTION, -- Keep answer record even if question is deleted (maybe?)
    CONSTRAINT FK_QuizAttemptAnswers_SelectedOptionID FOREIGN KEY (SelectedOptionID) REFERENCES QuizOptions (OptionID) ON DELETE NO ACTION -- Keep answer record even if option is deleted (maybe?)
  );

GO
-- Add Index for QuizAttemptAnswers
CREATE INDEX IX_QuizAttemptAnswers_AttemptID ON QuizAttemptAnswers (AttemptID);

CREATE INDEX IX_QuizAttemptAnswers_QuestionID ON QuizAttemptAnswers (QuestionID);

CREATE INDEX IX_QuizAttemptAnswers_SelectedOptionID ON QuizAttemptAnswers (SelectedOptionID);

PRINT 'QuizAttemptAnswers table created.';

GO
-- ============================================================================
-- 22. Table: Enrollments
-- ============================================================================
PRINT 'Creating Table: Enrollments...';

CREATE TABLE
  Enrollments (
    EnrollmentID BIGINT IDENTITY (1, 1) NOT NULL,
    AccountID BIGINT NOT NULL,
    CourseID BIGINT NOT NULL,
    EnrolledAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    PurchasePrice DECIMAL(18, 4) NOT NULL, -- Price at the time of enrollment
    CONSTRAINT PK_Enrollments PRIMARY KEY (EnrollmentID),
    CONSTRAINT FK_Enrollments_AccountID FOREIGN KEY (AccountID) REFERENCES Accounts (AccountID) ON DELETE CASCADE, -- Remove enrollment if user deleted
    CONSTRAINT FK_Enrollments_CourseID FOREIGN KEY (CourseID) REFERENCES Courses (CourseID) ON DELETE CASCADE, -- Remove enrollment if course deleted
    CONSTRAINT UQ_Enrollments_Account_Course UNIQUE (AccountID, CourseID), -- User can enroll in a course only once
    CONSTRAINT CK_Enrollments_PurchasePrice CHECK (PurchasePrice >= 0)
  );

GO
-- Add Indexes for Enrollments
CREATE INDEX IX_Enrollments_AccountID ON Enrollments (AccountID);

CREATE INDEX IX_Enrollments_CourseID ON Enrollments (CourseID);

PRINT 'Enrollments table created.';

GO
-- ============================================================================
-- 23. Table: LessonProgress
-- ============================================================================
PRINT 'Creating Table: LessonProgress...';

CREATE TABLE
  LessonProgress (
    ProgressID BIGINT IDENTITY (1, 1) NOT NULL,
    AccountID BIGINT NOT NULL,
    LessonID BIGINT NOT NULL,
    IsCompleted BIT NOT NULL DEFAULT 0,
    CompletedAt DATETIME2 NULL, -- Timestamp when IsCompleted became 1
    LastWatchedPosition INT NULL, -- Last position in seconds for video lessons
    LastWatchedAt DATETIME2 NULL, -- When the lesson was last accessed/watched
    CONSTRAINT PK_LessonProgress PRIMARY KEY (ProgressID),
    CONSTRAINT FK_LessonProgress_AccountID FOREIGN KEY (AccountID) REFERENCES Accounts (AccountID) ON DELETE CASCADE,
    CONSTRAINT FK_LessonProgress_LessonID FOREIGN KEY (LessonID) REFERENCES Lessons (LessonID) ON DELETE CASCADE,
    CONSTRAINT UQ_LessonProgress_Account_Lesson UNIQUE (AccountID, LessonID), -- One progress record per user per lesson
    CONSTRAINT CK_LessonProgress_LastWatchedPosition CHECK (
      LastWatchedPosition IS NULL
      OR LastWatchedPosition >= 0
    )
  );

GO
-- Add Indexes for LessonProgress
CREATE INDEX IX_LessonProgress_AccountID ON LessonProgress (AccountID);

CREATE INDEX IX_LessonProgress_LessonID ON LessonProgress (LessonID);

CREATE INDEX IX_LessonProgress_Completion ON LessonProgress (AccountID, IsCompleted) INCLUDE (LessonID);

-- Example for fetching completed lessons
PRINT 'LessonProgress table created.';

GO
-- ============================================================================
-- 24. Table: CourseReviews
-- ============================================================================
PRINT 'Creating Table: CourseReviews...';

CREATE TABLE
  CourseReviews (
    ReviewID BIGINT IDENTITY (1, 1) NOT NULL,
    CourseID BIGINT NOT NULL,
    AccountID BIGINT NOT NULL, -- User who wrote the review
    Rating TINYINT NOT NULL, -- 1 to 5 stars
    Comment NVARCHAR (MAX) NULL, -- Changed from NTEXT
    ReviewedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT PK_CourseReviews PRIMARY KEY (ReviewID),
    CONSTRAINT FK_CourseReviews_CourseID FOREIGN KEY (CourseID) REFERENCES Courses (CourseID) ON DELETE CASCADE, -- Delete review if course deleted
    CONSTRAINT FK_CourseReviews_AccountID FOREIGN KEY (AccountID) REFERENCES Accounts (AccountID) ON DELETE CASCADE, -- Delete review if user deleted (or SET NULL?)
    CONSTRAINT UQ_CourseReviews_Account_Course UNIQUE (AccountID, CourseID), -- User can review a course only once
    CONSTRAINT CK_CourseReviews_Rating CHECK (Rating BETWEEN 1 AND 5)
  );

GO
-- Add Indexes for CourseReviews
CREATE INDEX IX_CourseReviews_CourseID ON CourseReviews (CourseID);

CREATE INDEX IX_CourseReviews_AccountID ON CourseReviews (AccountID);

CREATE INDEX IX_CourseReviews_Course_Rating ON CourseReviews (CourseID, Rating);

PRINT 'CourseReviews table created.';

GO
-- ============================================================================
-- 25. Table: Currencies
-- ============================================================================
PRINT 'Creating Table: Currencies...';

CREATE TABLE
  Currencies (
    CurrencyID VARCHAR(10) NOT NULL, -- e.g., 'VND', 'USD', 'USDT'
    CurrencyName NVARCHAR (100) NOT NULL,
    Type VARCHAR(10) NOT NULL, -- 'FIAT', 'CRYPTO'
    DecimalPlaces TINYINT NOT NULL, -- Number of decimal places for display/formatting
    CONSTRAINT PK_Currencies PRIMARY KEY (CurrencyID),
    CONSTRAINT CK_Currencies_Type CHECK (Type IN ('FIAT', 'CRYPTO')),
    CONSTRAINT CK_Currencies_DecimalPlaces CHECK (DecimalPlaces >= 0)
  );

GO
-- Seed basic currencies
INSERT INTO
  Currencies (CurrencyID, CurrencyName, Type, DecimalPlaces)
VALUES
  ('VND', N'Việt Nam Đồng', 'FIAT', 0), -- Typically VND doesn't use decimals in display
  ('USD', N'Đô la Mỹ', 'FIAT', 2);

PRINT 'Currencies table created and seeded.';

GO
-- ============================================================================
-- 26. Table: PaymentMethods
-- ============================================================================
PRINT 'Creating Table: PaymentMethods...';

CREATE TABLE
  PaymentMethods (
    MethodID VARCHAR(20) NOT NULL, -- e.g., 'MOMO', 'VNPAY', 'BANK_TRANSFER', 'CRYPTO'
    MethodName NVARCHAR (100) NOT NULL,
    -- Could add IsEnabled BIT DEFAULT 1 here
    CONSTRAINT PK_PaymentMethods PRIMARY KEY (MethodID)
  );

GO
-- Seed basic payment methods
INSERT INTO
  PaymentMethods (MethodID, MethodName)
VALUES
  ('MOMO', N'Ví điện tử MoMo'),
  ('VNPAY', N'Cổng thanh toán VNPAY'),
  ('BANK_TRANSFER', N'Chuyển khoản ngân hàng'),
  ('SYSTEM_CREDIT', N'Tín dụng hệ thống');

-- For refunds or internal credits
-- ('CRYPTO', N'Tiền điện tử'); -- If applicable
PRINT 'PaymentMethods table created and seeded.';

GO
-- ============================================================================
-- 27. Table: PaymentStatuses
-- ============================================================================
PRINT 'Creating Table: PaymentStatuses...';

CREATE TABLE
  PaymentStatuses (
    StatusID VARCHAR(20) NOT NULL, -- e.g., 'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED'
    StatusName NVARCHAR (100) NOT NULL,
    CONSTRAINT PK_PaymentStatuses PRIMARY KEY (StatusID)
  );

GO
-- Seed payment statuses
INSERT INTO
  PaymentStatuses (StatusID, StatusName)
VALUES
  ('PENDING', N'Chờ thanh toán'),
  ('SUCCESS', N'Thành công'),
  ('FAILED', N'Thất bại'),
  ('CANCELLED', N'Đã hủy'),
  ('REFUNDED', N'Đã hoàn tiền');

PRINT 'PaymentStatuses table created and seeded.';

GO
-- ============================================================================
-- 28. Table: Promotions
-- ============================================================================
PRINT 'Creating Table: Promotions...';

CREATE TABLE
  Promotions (
    PromotionID INT IDENTITY (1, 1) NOT NULL,
    DiscountCode VARCHAR(50) NOT NULL, -- The code users enter
    PromotionName NVARCHAR (255) NOT NULL,
    Description NVARCHAR (MAX) NULL, -- Changed from NTEXT
    DiscountType VARCHAR(20) NOT NULL, -- 'PERCENTAGE', 'FIXED_AMOUNT'
    DiscountValue DECIMAL(18, 4) NOT NULL, -- Percentage (e.g., 10.00 for 10%) or fixed amount
    MinOrderValue DECIMAL(18, 4) NULL, -- Minimum order total to apply
    MaxDiscountAmount DECIMAL(18, 4) NULL, -- Maximum discount amount for percentage type
    StartDate DATETIME2 NOT NULL,
    EndDate DATETIME2 NOT NULL,
    MaxUsageLimit INT NULL, -- Max total uses for this code (NULL for unlimited)
    UsageCount INT NOT NULL DEFAULT 0, -- How many times this code has been used
    Status VARCHAR(20) NOT NULL DEFAULT 'INACTIVE', -- 'ACTIVE', 'INACTIVE', 'EXPIRED'
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT PK_Promotions PRIMARY KEY (PromotionID),
    CONSTRAINT UQ_Promotions_DiscountCode UNIQUE (DiscountCode),
    CONSTRAINT CK_Promotions_DiscountType CHECK (DiscountType IN ('PERCENTAGE', 'FIXED_AMOUNT')),
    CONSTRAINT CK_Promotions_DiscountValue CHECK (DiscountValue >= 0),
    CONSTRAINT CK_Promotions_MinOrderValue CHECK (
      MinOrderValue IS NULL
      OR MinOrderValue >= 0
    ),
    CONSTRAINT CK_Promotions_MaxDiscountAmount CHECK (
      MaxDiscountAmount IS NULL
      OR MaxDiscountAmount >= 0
    ),
    CONSTRAINT CK_Promotions_EndDate CHECK (EndDate >= StartDate),
    CONSTRAINT CK_Promotions_Status CHECK (Status IN ('ACTIVE', 'INACTIVE', 'EXPIRED'))
  );

GO
-- Add Indexes for Promotions
CREATE INDEX IX_Promotions_DiscountCode ON Promotions (DiscountCode);

CREATE INDEX IX_Promotions_Status ON Promotions (Status);

CREATE INDEX IX_Promotions_DateRange ON Promotions (StartDate, EndDate);

PRINT 'Promotions table created.';

GO
-- ============================================================================
-- 29. Table: Orders
-- ============================================================================
PRINT 'Creating Table: Orders...';

CREATE TABLE
  Orders (
    OrderID BIGINT IDENTITY (1, 1) NOT NULL,
    AccountID BIGINT NOT NULL, -- User who placed the order
    OrderDate DATETIME2 NOT NULL DEFAULT GETDATE (),
    OriginalTotalPrice DECIMAL(18, 4) NOT NULL, -- Sum of original prices of items
    DiscountAmount DECIMAL(18, 4) NOT NULL DEFAULT 0, -- Amount discounted by promotion
    FinalAmount DECIMAL(18, 4) NOT NULL, -- OriginalTotalPrice - DiscountAmount
    PromotionID INT NULL, -- Applied promotion (if any)
    PaymentID BIGINT NULL, -- Link to the actual payment transaction (FK added later)
    OrderStatus VARCHAR(30) NOT NULL DEFAULT 'PENDING_PAYMENT', -- 'PENDING_PAYMENT', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'
    CONSTRAINT PK_Orders PRIMARY KEY (OrderID),
    CONSTRAINT FK_Orders_AccountID FOREIGN KEY (AccountID) REFERENCES Accounts (AccountID) ON DELETE NO ACTION, -- Keep order history if user deleted
    CONSTRAINT FK_Orders_PromotionID FOREIGN KEY (PromotionID) REFERENCES Promotions (PromotionID) ON DELETE SET NULL, -- Keep order if promotion deleted
    CONSTRAINT CK_Orders_OrderStatus CHECK (
      OrderStatus IN (
        'PENDING_PAYMENT',
        'PROCESSING',
        'COMPLETED',
        'FAILED',
        'CANCELLED'
      )
    ),
    CONSTRAINT UQ_Orders_PaymentID UNIQUE (PaymentID)
    WHERE
      PaymentID IS NOT NULL -- An order links to one unique payment
      -- FK_Orders_PaymentID added after CoursePayments table is created
  );

GO
-- Add Indexes for Orders
CREATE INDEX IX_Orders_AccountID_Status ON Orders (AccountID, OrderStatus);

CREATE INDEX IX_Orders_OrderDate ON Orders (OrderDate);

PRINT 'Orders table created.';

GO
-- ============================================================================
-- 30. Table: OrderItems
-- ============================================================================
PRINT 'Creating Table: OrderItems...';

CREATE TABLE
  OrderItems (
    OrderItemID BIGINT IDENTITY (1, 1) NOT NULL,
    OrderID BIGINT NOT NULL,
    CourseID BIGINT NOT NULL,
    PriceAtOrder DECIMAL(18, 4) NOT NULL, -- Actual price of the course in this order (after potential global discounts, before promo code)
    EnrollmentID BIGINT NULL, -- Link to the enrollment created upon successful order completion (FK added later)
    CONSTRAINT PK_OrderItems PRIMARY KEY (OrderItemID),
    CONSTRAINT FK_OrderItems_OrderID FOREIGN KEY (OrderID) REFERENCES Orders (OrderID) ON DELETE CASCADE, -- Delete items if order is deleted
    CONSTRAINT FK_OrderItems_CourseID FOREIGN KEY (CourseID) REFERENCES Courses (CourseID) ON DELETE NO ACTION, -- Keep item record even if course deleted (for history)? Or RESTRICT?
    CONSTRAINT FK_OrderItems_EnrollmentID FOREIGN KEY (EnrollmentID) REFERENCES Enrollments (EnrollmentID) ON DELETE SET NULL, -- Keep item if enrollment deleted (unlikely scenario)
    CONSTRAINT UQ_OrderItems_Order_Course UNIQUE (OrderID, CourseID), -- Course appears once per order
    CONSTRAINT UQ_OrderItems_EnrollmentID UNIQUE (EnrollmentID)
    WHERE
      EnrollmentID IS NOT NULL -- One order item leads to one unique enrollment
  );

GO
-- Add Indexes for OrderItems
CREATE INDEX IX_OrderItems_OrderID ON OrderItems (OrderID);

CREATE INDEX IX_OrderItems_CourseID ON OrderItems (CourseID);

PRINT 'OrderItems table created.';

GO
-- ============================================================================
-- 31. Table: ExchangeRates
-- ============================================================================
PRINT 'Creating Table: ExchangeRates...';

CREATE TABLE
  ExchangeRates (
    RateID BIGINT IDENTITY (1, 1) NOT NULL,
    FromCurrencyID VARCHAR(10) NOT NULL,
    ToCurrencyID VARCHAR(10) NOT NULL,
    Rate DECIMAL(36, 18) NOT NULL, -- High precision for rates
    EffectiveTimestamp DATETIME2 NOT NULL DEFAULT GETDATE (), -- When this rate becomes effective
    Source NVARCHAR (100) NULL, -- e.g., 'Vietcombank', 'APIProviderX'
    CONSTRAINT PK_ExchangeRates PRIMARY KEY (RateID),
    CONSTRAINT FK_ExchangeRates_FromCurrencyID FOREIGN KEY (FromCurrencyID) REFERENCES Currencies (CurrencyID),
    CONSTRAINT FK_ExchangeRates_ToCurrencyID FOREIGN KEY (ToCurrencyID) REFERENCES Currencies (CurrencyID),
    CONSTRAINT CK_ExchangeRates_Rate CHECK (Rate > 0)
  );

GO
-- Add Index for ExchangeRates (Crucial for looking up the latest rate)
CREATE INDEX IX_ExchangeRates_From_To_Timestamp ON ExchangeRates (
  FromCurrencyID,
  ToCurrencyID,
  EffectiveTimestamp DESC
);

PRINT 'ExchangeRates table created.';

GO
-- ============================================================================
-- 32. Table: CoursePayments
-- ============================================================================
PRINT 'Creating Table: CoursePayments...';

CREATE TABLE
  CoursePayments (
    PaymentID BIGINT IDENTITY (1, 1) NOT NULL,
    OrderID BIGINT NOT NULL,
    FinalAmount DECIMAL(18, 4) NOT NULL, -- Total amount paid for the order (in system's base currency, e.g. VND)
    PaymentMethodID VARCHAR(20) NOT NULL,
    OriginalCurrencyID VARCHAR(10) NOT NULL, -- Currency used by the customer (e.g., USD)
    OriginalAmount DECIMAL(36, 18) NOT NULL, -- Amount paid in the original currency
    ExternalTransactionID VARCHAR(255) NULL, -- ID from payment gateway (MoMo, VNPAY)
    ConvertedCurrencyID VARCHAR(10) NOT NULL, -- System's base currency (e.g., VND)
    ConversionRate DECIMAL(24, 12) NULL, -- Rate used: Original -> Converted
    ConvertedTotalAmount DECIMAL(18, 4) NOT NULL, -- Should match FinalAmount if ConvertedCurrencyID is base
    TransactionFee DECIMAL(18, 4) NOT NULL DEFAULT 0, -- Fee charged by gateway (in ConvertedCurrency)
    PaymentStatusID VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    TransactionCompletedAt DATETIME2 NULL, -- Timestamp from gateway on success/failure
    AdditionalInfo NVARCHAR (MAX) NULL, -- Store extra data from gateway (JSON usually)
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT PK_CoursePayments PRIMARY KEY (PaymentID),
    CONSTRAINT FK_CoursePayments_OrderID FOREIGN KEY (OrderID) REFERENCES Orders (OrderID) ON DELETE RESTRICT, -- Prevent deleting order if payment exists
    CONSTRAINT UQ_CoursePayments_OrderID UNIQUE (OrderID), -- One payment attempt per order (can be retried via gateway mechanism, but links to same OrderID)
    CONSTRAINT FK_CoursePayments_PaymentMethodID FOREIGN KEY (PaymentMethodID) REFERENCES PaymentMethods (MethodID),
    CONSTRAINT FK_CoursePayments_OriginalCurrencyID FOREIGN KEY (OriginalCurrencyID) REFERENCES Currencies (CurrencyID),
    CONSTRAINT FK_CoursePayments_ConvertedCurrencyID FOREIGN KEY (ConvertedCurrencyID) REFERENCES Currencies (CurrencyID),
    CONSTRAINT FK_CoursePayments_PaymentStatusID FOREIGN KEY (PaymentStatusID) REFERENCES PaymentStatuses (StatusID)
  );

GO
-- Add Indexes for CoursePayments
CREATE INDEX IX_CoursePayments_OrderID ON CoursePayments (OrderID);

CREATE INDEX IX_CoursePayments_ExternalTransactionID ON CoursePayments (ExternalTransactionID)
WHERE
  ExternalTransactionID IS NOT NULL;

CREATE INDEX IX_CoursePayments_StatusID ON CoursePayments (PaymentStatusID);

CREATE INDEX IX_CoursePayments_MethodID ON CoursePayments (PaymentMethodID);

PRINT 'CoursePayments table created.';

GO
-- Add the deferred FK constraint from Orders to CoursePayments
PRINT 'Adding deferred FK from Orders to CoursePayments...';

ALTER TABLE Orders ADD CONSTRAINT FK_Orders_PaymentID FOREIGN KEY (PaymentID) REFERENCES CoursePayments (PaymentID) ON DELETE SET NULL;

-- If payment is deleted (shouldn't happen often), nullify link in order
GO PRINT 'Deferred FK FK_Orders_PaymentID added.';

GO
-- ============================================================================
-- 33. Table: PayoutStatuses
-- ============================================================================
PRINT 'Creating Table: PayoutStatuses...';

CREATE TABLE
  PayoutStatuses (
    StatusID VARCHAR(20) NOT NULL, -- 'PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED'
    StatusName NVARCHAR (100) NOT NULL,
    CONSTRAINT PK_PayoutStatuses PRIMARY KEY (StatusID)
  );

GO
-- Seed payout statuses
INSERT INTO
  PayoutStatuses (StatusID, StatusName)
VALUES
  ('PENDING', N'Chờ xử lý'),
  ('PROCESSING', N'Đang xử lý'),
  ('PAID', N'Đã thanh toán'),
  ('FAILED', N'Thất bại'),
  ('CANCELLED', N'Đã hủy');

PRINT 'PayoutStatuses table created and seeded.';

GO
-- ============================================================================
-- 34. Table: Payouts
-- ============================================================================
PRINT 'Creating Table: Payouts...';

CREATE TABLE
  Payouts (
    PayoutID BIGINT IDENTITY (1, 1) NOT NULL,
    InstructorID BIGINT NOT NULL, -- FK to Accounts (Role='INSTRUCTOR')
    Amount DECIMAL(18, 4) NOT NULL, -- Amount approved for payout (in CurrencyID)
    CurrencyID VARCHAR(10) NOT NULL, -- Currency requested/approved for payout
    ActualAmount DECIMAL(36, 18) NULL, -- Actual amount transferred after fees/conversion
    ActualCurrencyID VARCHAR(10) NULL, -- Currency of the ActualAmount (could be different if converted)
    ExchangeRate DECIMAL(24, 12) NULL, -- Rate if conversion happened (CurrencyID -> ActualCurrencyID)
    PaymentMethodID VARCHAR(20) NOT NULL, -- Method used (e.g., BANK_TRANSFER)
    PayoutDetails NVARCHAR (MAX) NULL, -- Snapshot of Bank Info used for this payout
    Fee DECIMAL(18, 4) NOT NULL DEFAULT 0.0000, -- Payout transaction fee (in CurrencyID or ActualCurrencyID?) - Assume CurrencyID for now.
    PayoutStatusID VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- FK to PayoutStatuses
    RequestedAt DATETIME2 NOT NULL DEFAULT GETDATE (), -- When withdrawal request was made/approved
    ProcessedAt DATETIME2 NULL, -- When admin initiated the transfer
    CompletedAt DATETIME2 NULL, -- When transfer was confirmed successful/failed
    AdminID BIGINT NULL, -- Admin who processed the payout
    AdminNote NVARCHAR (1000) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT PK_Payouts PRIMARY KEY (PayoutID),
    CONSTRAINT FK_Payouts_InstructorID FOREIGN KEY (InstructorID) REFERENCES Accounts (AccountID) ON DELETE NO ACTION, -- Keep payout record if instructor deleted
    CONSTRAINT FK_Payouts_CurrencyID FOREIGN KEY (CurrencyID) REFERENCES Currencies (CurrencyID),
    CONSTRAINT FK_Payouts_ActualCurrencyID FOREIGN KEY (ActualCurrencyID) REFERENCES Currencies (CurrencyID),
    CONSTRAINT FK_Payouts_PaymentMethodID FOREIGN KEY (PaymentMethodID) REFERENCES PaymentMethods (MethodID),
    CONSTRAINT FK_Payouts_PayoutStatusID FOREIGN KEY (PayoutStatusID) REFERENCES PayoutStatuses (StatusID),
    CONSTRAINT FK_Payouts_AdminID FOREIGN KEY (AdminID) REFERENCES Accounts (AccountID) ON DELETE SET NULL -- Nullify admin if admin deleted
  );

GO
-- Add Indexes for Payouts
CREATE INDEX IX_Payouts_InstructorID ON Payouts (InstructorID);

CREATE INDEX IX_Payouts_PayoutStatusID ON Payouts (PayoutStatusID);

CREATE INDEX IX_Payouts_AdminID ON Payouts (AdminID);

PRINT 'Payouts table created.';

GO
-- ============================================================================
-- 35. Table: PaymentSplits
-- ============================================================================
PRINT 'Creating Table: PaymentSplits...';

CREATE TABLE
  PaymentSplits (
    SplitID BIGINT IDENTITY (1, 1) NOT NULL,
    PaymentID BIGINT NOT NULL, -- Link to the successful payment
    OrderItemID BIGINT NOT NULL, -- Link to the specific item in the order
    RecipientAccountID BIGINT NOT NULL, -- Instructor who gets the revenue for this item
    Amount DECIMAL(18, 4) NOT NULL, -- Amount earned by instructor (in system base currency, e.g., VND) after commission
    PayoutID BIGINT NULL, -- Link to the payout batch where this amount was included (FK added later)
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT PK_PaymentSplits PRIMARY KEY (SplitID),
    CONSTRAINT FK_PaymentSplits_PaymentID FOREIGN KEY (PaymentID) REFERENCES CoursePayments (PaymentID) ON DELETE CASCADE, -- If payment record deleted, split is irrelevant
    CONSTRAINT FK_PaymentSplits_OrderItemID FOREIGN KEY (OrderItemID) REFERENCES OrderItems (OrderItemID) ON DELETE CASCADE, -- If order item deleted, split is irrelevant
    CONSTRAINT FK_PaymentSplits_RecipientAccountID FOREIGN KEY (RecipientAccountID) REFERENCES Accounts (AccountID) ON DELETE NO ACTION, -- Keep record even if instructor leaves?
    CONSTRAINT FK_PaymentSplits_PayoutID FOREIGN KEY (PayoutID) REFERENCES Payouts (PayoutID) ON DELETE SET NULL, -- If payout record deleted, unlink but keep split record
    CONSTRAINT UQ_PaymentSplits_Payment_OrderItem UNIQUE (PaymentID, OrderItemID) -- Ensure only one split per item per payment
  );

GO
-- Add Indexes for PaymentSplits
CREATE INDEX IX_PaymentSplits_PaymentID ON PaymentSplits (PaymentID);

CREATE INDEX IX_PaymentSplits_OrderItemID ON PaymentSplits (OrderItemID);

CREATE INDEX IX_PaymentSplits_Recipient ON PaymentSplits (RecipientAccountID);

CREATE INDEX IX_PaymentSplits_PayoutID ON PaymentSplits (PayoutID)
WHERE
  PayoutID IS NOT NULL;

PRINT 'PaymentSplits table created.';

GO
-- ============================================================================
-- 36. Table: WithdrawalRequests
-- ============================================================================
PRINT 'Creating Table: WithdrawalRequests...';

CREATE TABLE
  WithdrawalRequests (
    RequestID BIGINT IDENTITY (1, 1) NOT NULL,
    InstructorID BIGINT NOT NULL,
    RequestedAmount DECIMAL(18, 4) NOT NULL,
    RequestedCurrencyID VARCHAR(10) NOT NULL,
    PaymentMethodID VARCHAR(20) NOT NULL, -- e.g., BANK_TRANSFER
    PayoutDetailsSnapshot NVARCHAR (MAX) NOT NULL, -- Bank info (JSON/text) at time of request
    Status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED', 'CANCELLED'
    InstructorNotes NVARCHAR (1000) NULL,
    AdminID BIGINT NULL, -- Admin who handled the request
    AdminNotes NVARCHAR (1000) NULL,
    ProcessedAt DATETIME2 NULL, -- When status changed from PENDING/APPROVED
    PayoutID BIGINT NULL, -- Link to the actual payout transaction (FK added later)
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT PK_WithdrawalRequests PRIMARY KEY (RequestID),
    CONSTRAINT FK_WithdrawalRequests_InstructorID FOREIGN KEY (InstructorID) REFERENCES Accounts (AccountID) ON DELETE CASCADE, -- Delete request if instructor account deleted
    CONSTRAINT FK_WithdrawalRequests_RequestedCurrencyID FOREIGN KEY (RequestedCurrencyID) REFERENCES Currencies (CurrencyID),
    CONSTRAINT FK_WithdrawalRequests_PaymentMethodID FOREIGN KEY (PaymentMethodID) REFERENCES PaymentMethods (MethodID),
    CONSTRAINT FK_WithdrawalRequests_AdminID FOREIGN KEY (AdminID) REFERENCES Accounts (AccountID) ON DELETE SET NULL,
    CONSTRAINT FK_WithdrawalRequests_PayoutID FOREIGN KEY (PayoutID) REFERENCES Payouts (PayoutID) ON DELETE SET NULL, -- Link request to the payout record
    CONSTRAINT CK_WithdrawalRequests_RequestedAmount CHECK (RequestedAmount > 0),
    CONSTRAINT CK_WithdrawalRequests_Status CHECK (
      Status IN (
        'PENDING',
        'APPROVED',
        'REJECTED',
        'PROCESSING',
        'COMPLETED',
        'CANCELLED'
      )
    )
  );

GO
-- Add Indexes for WithdrawalRequests
CREATE INDEX IX_WithdrawalRequests_InstructorID ON WithdrawalRequests (InstructorID);

CREATE INDEX IX_WithdrawalRequests_Status ON WithdrawalRequests (Status);

CREATE INDEX IX_WithdrawalRequests_PayoutID ON WithdrawalRequests (PayoutID)
WHERE
  PayoutID IS NOT NULL;

CREATE INDEX IX_WithdrawalRequests_AdminID ON WithdrawalRequests (AdminID);

PRINT 'WithdrawalRequests table created.';

GO
-- ============================================================================
-- 37. Table: CourseApprovalRequests
-- ============================================================================
PRINT 'Creating Table: CourseApprovalRequests...';

CREATE TABLE
  CourseApprovalRequests (
    RequestID BIGINT IDENTITY (1, 1) NOT NULL,
    CourseID BIGINT NOT NULL, -- Course being submitted/updated
    InstructorID BIGINT NOT NULL, -- Instructor submitting
    RequestType VARCHAR(30) NOT NULL, -- 'INITIAL_SUBMISSION', 'UPDATE_SUBMISSION', 'RE_SUBMISSION'
    Status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED', 'NEEDS_REVISION'
    InstructorNotes NVARCHAR (MAX) NULL, -- Changed from NTEXT
    AdminID BIGINT NULL, -- Admin who reviewed
    AdminNotes NVARCHAR (MAX) NULL, -- Feedback from admin (Changed from NTEXT)
    ReviewedAt DATETIME2 NULL, -- When the admin made a decision
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT PK_CourseApprovalRequests PRIMARY KEY (RequestID),
    CONSTRAINT FK_CourseApprovalRequests_CourseID FOREIGN KEY (CourseID) REFERENCES Courses (CourseID) ON DELETE CASCADE, -- Delete request if course deleted
    CONSTRAINT FK_CourseApprovalRequests_InstructorID FOREIGN KEY (InstructorID) REFERENCES Accounts (AccountID) ON DELETE NO ACTION, -- Keep request history if instructor deleted
    CONSTRAINT FK_CourseApprovalRequests_AdminID FOREIGN KEY (AdminID) REFERENCES Accounts (AccountID) ON DELETE SET NULL,
    CONSTRAINT CK_CourseApprovalRequests_RequestType CHECK (
      RequestType IN (
        'INITIAL_SUBMISSION',
        'UPDATE_SUBMISSION',
        'RE_SUBMISSION'
      )
    ),
    CONSTRAINT CK_CourseApprovalRequests_Status CHECK (
      Status IN (
        'PENDING',
        'APPROVED',
        'REJECTED',
        'NEEDS_REVISION'
      )
    )
  );

GO
-- Add Indexes for CourseApprovalRequests
CREATE INDEX IX_CourseApprovalRequests_CourseID ON CourseApprovalRequests (CourseID);

CREATE INDEX IX_CourseApprovalRequests_InstructorID ON CourseApprovalRequests (InstructorID);

CREATE INDEX IX_CourseApprovalRequests_Status ON CourseApprovalRequests (Status);

CREATE INDEX IX_CourseApprovalRequests_AdminID ON CourseApprovalRequests (AdminID);

PRINT 'CourseApprovalRequests table created.';

GO
-- ============================================================================
-- 38. Table: Notifications
-- ============================================================================
PRINT 'Creating Table: Notifications...';

CREATE TABLE
  Notifications (
    NotificationID BIGINT IDENTITY (1, 1) NOT NULL,
    RecipientAccountID BIGINT NOT NULL, -- User who receives the notification
    Type VARCHAR(50) NOT NULL, -- e.g., 'COURSE_PUBLISHED', 'NEW_REVIEW', 'PAYOUT_COMPLETED', 'SYSTEM_ANNOUNCEMENT'
    Message NVARCHAR (MAX) NOT NULL, -- The notification text
    RelatedEntityType VARCHAR(50) NULL, -- e.g., 'Course', 'Review', 'Order', 'Payout'
    RelatedEntityID VARCHAR(255) NULL, -- ID of the related entity (BIGINT or VARCHAR depending on target PK type)
    IsRead BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT PK_Notifications PRIMARY KEY (NotificationID),
    CONSTRAINT FK_Notifications_RecipientAccountID FOREIGN KEY (RecipientAccountID) REFERENCES Accounts (AccountID) ON DELETE CASCADE -- Delete notifications if user deleted
    -- Cannot add FK for RelatedEntityID due to polymorphism
  );

GO
-- Add Indexes for Notifications
CREATE INDEX IX_Notifications_RecipientAccountID ON Notifications (RecipientAccountID);

-- Index for fetching unread notifications efficiently
CREATE INDEX IX_Notifications_Recipient_IsRead_CreatedAt ON Notifications (RecipientAccountID, IsRead, CreatedAt DESC);

PRINT 'Notifications table created.';

GO
-- ============================================================================
-- 39. Table: Settings
-- ============================================================================
PRINT 'Creating Table: Settings...';

CREATE TABLE
  Settings (
    SettingKey VARCHAR(100) NOT NULL, -- e.g., 'PlatformCommissionRate', 'DefaultCurrency', 'MinWithdrawalAmount'
    SettingValue NVARCHAR (MAX) NOT NULL, -- Store value as string, parse in application
    Description NVARCHAR (500) NULL,
    IsEditableByAdmin BIT NOT NULL DEFAULT 1, -- Can admins change this via UI?
    LastUpdated DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT PK_Settings PRIMARY KEY (SettingKey)
  );

GO
-- Seed basic settings
INSERT INTO
  Settings (
    SettingKey,
    SettingValue,
    Description,
    IsEditableByAdmin
  )
VALUES
  (
    'PlatformCommissionRate',
    '30.00',
    N'Tỷ lệ hoa hồng nền tảng (%) cho mỗi khóa học bán được',
    1
  ),
  (
    'DefaultCurrency',
    'VND',
    N'Tiền tệ mặc định của hệ thống',
    0
  ), -- Usually not editable
  (
    'MinWithdrawalAmountVND',
    '200000',
    N'Số tiền tối thiểu cho yêu cầu rút tiền (VND)',
    1
  ),
  (
    'InstructorSignupEnabled',
    '1',
    N'Cho phép người dùng mới đăng ký làm giảng viên (1=Yes, 0=No)',
    1
  );

PRINT 'Settings table created and seeded.';

GO
-- ============================================================================
-- 40. Table: DiscussionThreads
-- ============================================================================
PRINT 'Creating Table: DiscussionThreads...';

CREATE TABLE
  DiscussionThreads (
    ThreadID BIGINT IDENTITY (1, 1) NOT NULL,
    CourseID BIGINT NOT NULL, -- Thread belongs to a course
    LessonID BIGINT NULL, -- Optionally linked to a specific lesson
    Title NVARCHAR (500) NOT NULL, -- Title of the discussion/question
    CreatedByAccountID BIGINT NOT NULL, -- User who started the thread
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE (), -- Track last reply time maybe? Or just edit time of title?
    CONSTRAINT PK_DiscussionThreads PRIMARY KEY (ThreadID),
    CONSTRAINT FK_DiscussionThreads_CourseID FOREIGN KEY (CourseID) REFERENCES Courses (CourseID) ON DELETE CASCADE, -- Delete threads if course deleted
    CONSTRAINT FK_DiscussionThreads_LessonID FOREIGN KEY (LessonID) REFERENCES Lessons (LessonID) ON DELETE SET NULL, -- Unlink lesson if deleted, keep thread
    CONSTRAINT FK_DiscussionThreads_CreatedByAccountID FOREIGN KEY (CreatedByAccountID) REFERENCES Accounts (AccountID) ON DELETE NO ACTION -- Keep thread even if creator deleted
  );

GO
-- Add Indexes for DiscussionThreads
CREATE INDEX IX_DiscussionThreads_CourseLesson ON DiscussionThreads (CourseID, LessonID);

CREATE INDEX IX_DiscussionThreads_CreatedBy ON DiscussionThreads (CreatedByAccountID);

PRINT 'DiscussionThreads table created.';

GO
-- ============================================================================
-- 41. Table: DiscussionPosts
-- ============================================================================
PRINT 'Creating Table: DiscussionPosts...';

CREATE TABLE
  DiscussionPosts (
    PostID BIGINT IDENTITY (1, 1) NOT NULL,
    ThreadID BIGINT NOT NULL, -- Post belongs to a thread
    ParentPostID BIGINT NULL, -- For nested replies (references PostID of parent)
    AccountID BIGINT NOT NULL, -- User who wrote the post
    PostText NVARCHAR (MAX) NOT NULL, -- The content of the post/reply
    IsInstructorPost BIT NOT NULL DEFAULT 0, -- Flag if posted by the course instructor
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE (),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE (), -- For edits
    CONSTRAINT PK_DiscussionPosts PRIMARY KEY (PostID),
    CONSTRAINT FK_DiscussionPosts_ThreadID FOREIGN KEY (ThreadID) REFERENCES DiscussionThreads (ThreadID) ON DELETE CASCADE, -- Delete posts if thread deleted
    CONSTRAINT FK_DiscussionPosts_ParentPostID FOREIGN KEY (ParentPostID) REFERENCES DiscussionPosts (PostID) ON DELETE NO ACTION, -- Do not cascade delete replies
    CONSTRAINT FK_DiscussionPosts_AccountID FOREIGN KEY (AccountID) REFERENCES Accounts (AccountID) ON DELETE NO ACTION -- Keep post even if user deleted
  );

GO
-- Add Indexes for DiscussionPosts
CREATE INDEX IX_DiscussionPosts_ThreadCreatedAt ON DiscussionPosts (ThreadID, CreatedAt);

-- Fetch posts in order
CREATE INDEX IX_DiscussionPosts_ParentPost ON DiscussionPosts (ParentPostID)
WHERE
  ParentPostID IS NOT NULL;

CREATE INDEX IX_DiscussionPosts_Account ON DiscussionPosts (AccountID);

PRINT 'DiscussionPosts table created.';

GO
-- ============================================================================
-- Finalization
-- ============================================================================
PRINT '============================================================================';

PRINT ' Database ThreeTEduTechLMS and all tables created successfully!';

PRINT '============================================================================';

GO