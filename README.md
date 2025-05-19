Đồ án 3TEduTech

I. Database

Kiểu dữ liệu là gợi ý chung, bạn cần điều chỉnh cho phù hợp với hệ quản trị CSDL cụ thể (ví dụ: NVARCHAR cho SQL Server, VARCHAR hoặc TEXT cho PostgreSQL/MySQL, DATETIME2 hoặc TIMESTAMP).

PK là Khóa chính (Primary Key).

FK là Khóa ngoại (Foreign Key).

UQ là Ràng buộc duy nhất (Unique Constraint).

IX là Chỉ mục (Index) để tăng tốc truy vấn.

1. Bảng: Roles (Lưu thông tin các vai trò)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
RoleID VARCHAR(10) PK, Ví dụ: 'NU', 'GV', 'AD', 'SA' (Không nên tự tăng)
RoleName NVARCHAR(100) NOT NULL, Tên vai trò (Student, Instructor, Admin)
Description NVARCHAR(500) NULL
CreatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()/NOW()
UpdatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()/NOW()

2. Bảng: Accounts (Lưu thông tin đăng nhập và cơ bản)
   Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
   AccountID BIGINT PK, IDENTITY(1,1) / Auto-increment
   Email VARCHAR(255) NOT NULL, UQ, IX, Nên có check định dạng email
   HashedPassword VARCHAR(255) NULL (Cho phép null nếu đăng nhập bằng Social)
   RoleID VARCHAR(10) NOT NULL, FK -> Roles(RoleID)
   Status VARCHAR(20) NOT NULL, CHECK (Status IN ('ACTIVE', 'INACTIVE', 'BANNED', 'PENDING_VERIFICATION', DEFAULT 'PENDING_VERIFICATION', IX
   EmailVerificationToken VARCHAR(128) NULL, IX (Lưu hash)
   EmailVerificationExpires DATETIME2 NULL
   PasswordResetToken VARCHAR(128) NULL, IX (Lưu hash)
   PasswordResetExpires DATETIME2 NULL
   HasSocialLogin BIT NOT NULL, DEFAULT 0
   CreatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()/NOW()
   UpdatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()/NOW()

3. Bảng: AuthMethods (Lưu phương thức đăng nhập, đặc biệt cho Social)
   Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
   AuthMethodID BIGINT PK, Auto-increment
   AccountID BIGINT NOT NULL, FK -> Accounts(AccountID), IX
   LoginType VARCHAR(20) NOT NULL, CHECK (LoginType IN ('EMAIL', 'GOOGLE', 'FACEBOOK')), IX
   ExternalID VARCHAR(255) NULL, IX (ID từ Google/Facebook)
   PK_UQ UQ (AccountID, LoginType)

4. Bảng: UserProfiles (Thông tin hồ sơ chung cho mọi người dùng)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
AccountID BIGINT PK, FK -> Accounts(AccountID)
FullName NVARCHAR(150) NOT NULL
AvatarUrl VARCHAR(500) NULL
CoverImageUrl VARCHAR(500) NULL
Gender VARCHAR(10) NULL, CHECK (Gender IN ('MALE', 'FEMALE'))
BirthDate DATE NULL
PhoneNumber VARCHAR(20) NULL, UQ, IX
Headline NVARCHAR(255) NULL
Location NVARCHAR(255) NULL
CreatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()/NOW()
UpdatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()/NOW()

5.Bảng: Skills (Góp ý: Tách ra để dễ quản lý và truy vấn)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
SkillID INT PK, IDENTITY(1,1)
SkillName NVARCHAR(100) NOT NULL, UQ
Description NVARCHAR(500) NULL
CreatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()
UpdatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()

6. Bảng: InstructorSkills (Góp ý: Bảng nối GV-Kỹ năng)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
InstructorSkillID BIGINT PK, IDENTITY(1,1)
AccountID BIGINT NOT NULL, FK -> Accounts(AccountID) ON DELETE NO ACTION,  UQ (AccountID, SkillID)
SkillID INT NOT NULL, FK -> Skills(SkillID) ON DELETE NO ACTION, UQ (AccountID, SkillID)

7. Bảng: InstructorProfiles (Thông tin riêng của Giảng viên)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
AccountID BIGINT PK, FK -> Accounts(AccountID) ON DELETE CASCADE
ProfessionalTitle NVARCHAR(255) NULL
Bio NVARCHAR(MAX) NULL
AboutMe NVARCHAR(MAX) NULL (Có thể lưu HTML)
LastBalanceUpdate DATETIME2 NULL
CreatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()/NOW()
UpdatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()/NOW()

8. Bảng: InstructorSocialLinks (Góp ý: Tách ra)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
SocialLinkID BIGINT PK, IDENTITY(1,1)
AccountID BIGINT NOT NULL, FK -> Accounts(AccountID) ON DELETE CASCADE, UQ (AccountID, Platform)
Platform VARCHAR(50) NOT NULL, UQ (AccountID, Platform), Ví dụ: 'LINKEDIN'
Url NVARCHAR(MAX) NOT NULL

 9. Bảng: Carts (Giỏ hàng) - Bảng mới để quản lý giỏ hàng

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
CartID BIGINT IDENTITY(1,1) PRIMARY KEY
AccountID BIGINT NOT NULL UNIQUE, FK -> Accounts(AccountID) ON DELETE CASCADE
CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),

10. Bảng: CartItems (Các mục trong Giỏ hàng) - Bảng mới

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
CartItemID BIGINT IDENTITY(1,1) PRIMARY KEY
CartID BIGINT NOT NULL, FK -> Carts(CartID) ON DELETE CASCADE, Part of UNIQUE (UQ_CartItem_Cart_Course), INDEXED (IX_CartItems_CartID)
CourseID BIGINT NOT NULL, FK -> Courses(CourseID) ON DELETE CASCADE (Cân nhắc), Part of UNIQUE (UQ_CartItem_Cart_Course)
PriceAtAddition DECIMAL(18, 4) NOT NULL, Giá khóa học tại thời điểm thêm vào giỏ
AddedAt DATETIME2 NOT NULL DEFAULT GETDATE()
(Constraint) UQ_CartItem_Cart_Course: UNIQUE (CartID, CourseID) - Mỗi khóa học chỉ xuất hiện 1 lần trong 1 giỏ hàng

11. Bảng: Categories(Danh mục khóa học)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
CategoryID INT PK, IDENTITY(1,1)
CategoryName NVARCHAR(150) NOT NULL, UQ
Slug VARCHAR(150) NOT NULL, UQ, IX
Description NVARCHAR(500) NULL
IconUrl VARCHAR(500) NULL
CreatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()
UpdatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()

12. Bảng: Levels (Cấp độ khóa học)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
LevelID INT PK, IDENTITY(1,1)
LevelName NVARCHAR(100) NOT NULL, UQ
CreatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()
UpdatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()

13. Bảng: CourseStatuses (Trạng thái khóa học)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
StatusID VARCHAR(20) PK, Ví dụ: 'DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED'
StatusName NVARCHAR(100) NOT NULL
Description NVARCHAR(255) NULL

14. Bảng: Courses (Khóa học)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
CourseID BIGINT PK, IDENTITY(1,1)
CourseName NVARCHAR(500) NOT NULL, IX
Slug NVARCHAR(500) NOT NULL, UQ, IX
ShortDescription NVARCHAR(500) NOT NULL
FullDescription NVARCHAR(MAX) NOT NULL
Requirements NVARCHAR(MAX) NULL
LearningOutcomes NVARCHAR(MAX) NULL
ThumbnailUrl VARCHAR(MAX) NULL
IntroVideoUrl VARCHAR(MAX) NULL
OriginalPrice DECIMAL(18, 4) NOT NULL, CHECK (OriginalPrice >= 0)
DiscountedPrice DECIMAL(18, 4) NULL, CHECK (DiscountedPrice >= 0)
InstructorID BIGINT NOT NULL, FK -> Accounts(AccountID), IX
CategoryID INT NOT NULL, FK -> Categories(CategoryID), IX
LevelID INT NOT NULL, FK -> Levels(LevelID), IX
Language VARCHAR(10) NOT NULL Fk -> Languages
StatusID VARCHAR(20) NOT NULL, FK -> CourseStatuses(StatusID), IX, DEFAULT 'DRAFT'
PublishedAt DATETIME2 NULL
IsFeatured BIT NOT NULL, DEFAULT 0, IX
LiveCourseID BIGINT NULL, FK -> Courses(CourseID), IX (Cho bản nháp)
CreatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()
UpdatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()
ThumbnailPublicId VARCHAR(255) NULL
IntroVideoPublicId VARCHAR(255) NULL
AverageRating DECIMAL(3, 2) NULL
ReviewCount INT NULL

15. Bảng: Sections (Chương của khóa học)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
SectionID BIGINT PK, IDENTITY(1,1)
CourseID BIGINT NOT NULL, FK -> Courses(CourseID) ON DELETE CASCADE, IX
SectionName NVARCHAR(255) NOT NULL
SectionOrder INT NOT NULL, DEFAULT 0, IX (CourseID, SectionOrder)
Description NVARCHAR(MAX) NULL
OriginalID BIGINT NULL, FK -> Sections(SectionID), IX (WHERE OriginalID IS NOT NULL)
CreatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()
UpdatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()

12. Bảng: Lessons (Bài học trong chương)
    Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
    LessonID BIGINT PK, IDENTITY(1,1)
    SectionID BIGINT NOT NULL, FK -> Sections(SectionID) ON DELETE CASCADE, IX
    LessonName NVARCHAR(255) NOT NULL
    Description NVARCHAR(MAX) NULL
    LessonOrder INT NOT NULL, DEFAULT 0, IX (SectionID, LessonOrder)
    LessonType VARCHAR(20) NOT NULL CHECK (LessonType IN ('VIDEO', 'TEXT', 'QUIZ'))
    VideoSourceType VARCHAR(20) NULL
    ExternalVideoID VARCHAR(255) NULL
    ThumbnailUrl VARCHAR(500) NULL
    VideoDurationSeconds INT NULL, CHECK (VideoDurationSeconds >= 0)
    TextContent NVARCHAR(MAX) NULL
    IsFreePreview BIT NOT NULL, DEFAULT 0
    OriginalID BIGINT NULL, FK -> Lessons(LessonID), IX (WHERE OriginalID IS NOT NULL)
    CreatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()
    UpdatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()

Bảng: LessonSubtitles (Phụ đề cho Bài học)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
SubtitleID INT IDENTITY(1,1) PRIMARY KEY
LessonID BIGINT NOT NULL, FK -> Lessons(LessonID) ON DELETE CASCADE
LanguageCode VARCHAR(10) NOT NULL, Mã ngôn ngữ (vd: 'vi', 'en') FK -> Languages
SubtitleUrl VARCHAR(MAX) NOT NULL, URL công khai đến file .vtt
IsDefault BIT NOT NULL DEFAULT 0, Đánh dấu phụ đề mặc định (nếu có)
UploadedAt DATETIME2 DEFAULT GETDATE()

Bảng: Languages (Ngôn ngữ)
Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
LanguageCode VARCHAR(10) PK, NOT NULL, Mã ngôn ngữ chuẩn (ví dụ: 'en', 'vi', 'ja', 'ko') - Thường là ISO 639-1
LanguageName NVARCHAR(50) NOT NULL, UNIQUE, Tên ngôn ngữ hiển thị (ví dụ: 'English', 'Tiếng Việt')
NativeName NVARCHAR(50) NULL, Tên ngôn ngữ theo tiếng bản địa (ví dụ: '日本語', '한국어') - Tùy chọn
IsActive BIT NOT NULL DEFAULT 1, Cho phép hiển thị/sử dụng ngôn ngữ này không?
DisplayOrder INT NULL, Thứ tự hiển thị trong danh sách (tùy chọn)
CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE()
UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE()

INDEX IX_Lessons_SectionID_Order (SectionID, LessonOrder)

17. Bảng: LessonAttachments 

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
AttachmentID INT IDENTITY(1,1) PRIMARY KEY
LessonID BIGINT NOT NULL, FK -> Lessons(LessonID) ON DELETE CASCADE, INDEXED (IX_LessonAttachments_LessonID)
FileName NVARCHAR(255) NOT NULL, Tên hiển thị
FileURL VARCHAR(MAX) NOT NULL, URL tải file (Cloudinary/R2)
FileType VARCHAR(50) NULL, Loại file (pdf, zip, js,...)
FileSize BIGINT NULL, Kích thước file (bytes)
CloudStorageID VARCHAR(255) NULL, ID trên cloud storage (dùng để xóa file gốc)
UploadedAt DATETIME2 DEFAULT GETDATE()

18. Bảng: QuizQuestions (Câu hỏi trong một bài học Quiz)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
QuestionID INT IDENTITY(1,1) PRIMARY KEY
LessonID BIGINT NOT NULL, FK -> Lessons(LessonID) ON DELETE CASCADE, Part of INDEX (IX_QuizQuestions_LessonID_Order)
QuestionText NVARCHAR(MAX) NOT NULL, Nội dung câu hỏi
Explanation NVARCHAR(MAX) NULL, Giải thích đáp án (hiển thị sau khi làm)
QuestionOrder INT NOT NULL DEFAULT 0, Thứ tự câu hỏi, Part of INDEX (IX_QuizQuestions_LessonID_Order)
CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE()
UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE()

19. Bảng: QuizOptions

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
OptionID BIGINT IDENTITY(1,1) PRIMARY KEY
QuestionID INT NOT NULL, FK -> QuizQuestions(QuestionID) ON DELETE CASCADE, INDEXED (IX_QuizOptions_QuestionID)
OptionText NVARCHAR(MAX) NOT NULL, Nội dung của lựa chọn
IsCorrectAnswer BIT NOT NULL DEFAULT 0, Cờ đánh dấu đây là đáp án đúng
OptionOrder INT NOT NULL DEFAULT 0, Thứ tự hiển thị lựa chọn (A, B, C, D...)

20.  Bảng: QuizAttempts (Lượt làm Quiz của Học viên)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
AttemptID BIGINT IDENTITY(1,1) PRIMARY KEY
LessonID BIGINT NOT NULL, FK -> Lessons(LessonID) ON DELETE CASCADE (Chỉ LessonType='QUIZ'), Part of INDEX (IX_QuizAttempts_AccountID_LessonID)
AccountID BIGINT NOT NULL, FK -> Accounts(AccountID) ON DELETE CASCADE (Học viên), Part of INDEX (IX_QuizAttempts_AccountID_LessonID)
StartedAt DATETIME2 NOT NULL DEFAULT GETDATE()
CompletedAt DATETIME2 NULL, Thời điểm hoàn thành lượt làm
Score DECIMAL(5, 2) NULL, Điểm số (ví dụ: %, hoặc tổng điểm)
IsPassed BIT NULL, Đạt hay không (tùy theo ngưỡng)
AttemptNumber INT NULL, cho phép làm lại nhiều lần Unique(LessonID, AccountID, AttemptNumber).

21. Bảng: QuizAttemptAnswers (Câu trả lời chi tiết cho mỗi lượt làm Quiz)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
AttemptAnswerID BIGINT IDENTITY(1,1) PRIMARY KEY
AttemptID BIGINT NOT NULL, FK -> QuizAttempts(AttemptID) ON DELETE CASCADE, INDEXED (IX_QuizAttemptAnswers_AttemptID)
QuestionID INT NOT NULL, FK -> QuizQuestions(QuestionID) (Không CASCADE DELETE)
SelectedOptionID BIGINT NULL, FK -> QuizOptions(OptionID) (Không CASCADE DELETE), Lựa chọn được học viên chọn
IsCorrect BIT NULL, Kết quả đúng/sai (nên tính toán khi chấm)

22. Bảng: Enrollments (Đăng ký khóa học)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
EnrollmentID BIGINT PK, IDENTITY(1,1)
AccountID BIGINT NOT NULL, FK -> Accounts(AccountID) ON DELETE CASCADE, IX, UQ (AccountID, CourseID)
CourseID BIGINT NOT NULL, FK -> Courses(CourseID) ON DELETE CASCADE, IX, UQ (AccountID, CourseID)
EnrolledAt DATETIME2 NOT NULL, DEFAULT GETDATE()
PurchasePrice DECIMAL(18, 4) NOT NULL, CHECK (PurchasePrice >= 0)
Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú

23. Bảng: LessonProgress (Tiến độ bài học)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
ProgressID BIGINT PK, IDENTITY(1,1)
AccountID BIGINT NOT NULL, FK -> Accounts(AccountID) ON DELETE CASCADE, IX, UQ (AccountID, LessonID)
LessonID BIGINT NOT NULL, FK -> Lessons(LessonID) ON DELETE CASCADE, IX, UQ (AccountID, LessonID)
IsCompleted BIT NOT NULL, DEFAULT 0
CompletedAt DATETIME2 NULL
LastWatchedPosition INT NULL, CHECK (LastWatchedPosition >= 0)
LastWatchedAt DATETIME2 NULL, DEFAULT GETDATE()

24. Bảng: CourseReviews (Đánh giá khóa học)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
ReviewID BIGINT PK, IDENTITY(1,1)
CourseID BIGINT NOT NULL, FK -> Courses(CourseID) ON DELETE CASCADE, IX, UQ (AccountID, CourseID)
AccountID BIGINT NOT NULL, FK -> Accounts(AccountID) ON DELETE CASCADE, IX, UQ (AccountID, CourseID)
Rating TINYINT NOT NULL, CHECK (Rating BETWEEN 1 AND 5)
Comment NTEXT NULL
ReviewedAt DATETIME2 NOT NULL, DEFAULT GETDATE()

25. Bảng: Currencies (Loại tiền tệ)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
CurrencyID VARCHAR(10) PK, NOT NULL, Ví dụ: 'VND', 'USD', 'USDT'
CurrencyName NVARCHAR(100) NOT NULL
Type VARCHAR(10) NOT NULL, CHECK (Type IN ('FIAT', 'CRYPTO'))
DecimalPlaces TINYINT NOT NULL, CHECK (DecimalPlaces >= 0)

26. Bảng: PaymentMethods (Phương thức thanh toán)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
MethodID VARCHAR(20) PK, NOT NULL, Ví dụ: 'MOMO', 'VNPAY', 'CRYPTO', 'BANK'
MethodName NVARCHAR(100) NOT NULL
IconUrl
Description

27. Bảng: PaymentStatuses (Trạng thái thanh toán)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
StatusID VARCHAR(20) PK, Ví dụ: 'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED'
StatusName NVARCHAR(100) NOT NULL

28. Bảng: Promotions (Khuyến mãi)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
PromotionID INT PK, IDENTITY(1,1)
DiscountCode VARCHAR(50) NOT NULL, UQ, IX
PromotionName NVARCHAR(255) NOT NULL
Description NTEXT NULL
DiscountType VARCHAR(20) NOT NULL, CHECK (DiscountType IN ('PERCENTAGE', 'FIXED_AMOUNT'))
DiscountValue DECIMAL(18, 4) NOT NULL, CHECK (DiscountValue >= 0)
MinOrderValue DECIMAL(18, 4) NULL, CHECK (MinOrderValue >= 0)
MaxDiscountAmount DECIMAL(18, 4) NULL, CHECK (MaxDiscountAmount >= 0)
StartDate DATETIME2 NOT NULL
EndDate DATETIME2 NOT NULL, CHECK (EndDate >= StartDate)
MaxUsageLimit INT NULL
UsageCount INT NOT NULL, DEFAULT 0
Status VARCHAR(20) NOT NULL, DEFAULT 'INACTIVE', IX, CHECK (Status IN ('ACTIVE', 'INACTIVE', 'EXPIRED'))
CreatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()
UpdatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()

29.  Bảng: Orders (Đơn hàng - cho Giỏ hàng)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
OrderID BIGINT IDENTITY(1,1) PRIMARY KEY
AccountID BIGINT NOT NULL, FK -> Accounts(AccountID), Part of INDEX (IX_Orders_AccountID_Status)
OrderDate DATETIME2 NOT NULL DEFAULT GETDATE()
OriginalTotalPrice DECIMAL(18, 4) NOT NULL, Tổng giá gốc của các khóa học
DiscountAmount DECIMAL(18, 4) NOT NULL DEFAULT 0
FinalAmount DECIMAL(18, 4) NOT NULL, Số tiền cuối cùng cần thanh toán
PromotionID INT NULL, FK -> Promotions(PromotionID) ON DELETE SET NULL
PaymentID BIGINT NULL, UNIQUE, FK -> CoursePayments(PaymentID) ON DELETE SET NULL (Thêm sau khi tạo CoursePayments)
OrderStatus VARCHAR(30) NOT NULL DEFAULT 'PENDING_PAYMENT', ('PENDING_PAYMENT', 'COMPLETED', 'FAILED', 'CANCELLED'), Part of INDEX (IX_Orders_AccountID_Status)

29. OrderItems (Chi tiết Đơn hàng)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
OrderItemID BIGINT IDENTITY(1,1) PRIMARY KEY
OrderID BIGINT NOT NULL, FK -> Orders(OrderID) ON DELETE CASCADE, Part of UNIQUE (UQ_OrderItem_Order_Course), INDEXED (IX_OrderItems_OrderID)
CourseID BIGINT NOT NULL, FK -> Courses(CourseID) (Không CASCADE DELETE), Part of UNIQUE (UQ_OrderItem_Order_Course)
PriceAtOrder DECIMAL(18, 4) NOT NULL, Giá khóa học tại thời điểm đặt hàng
EnrollmentID BIGINT NULL, UNIQUE, FK -> Enrollments(EnrollmentID) ON DELETE SET NULL (Liên kết sau khi hoàn thành đơn hàng)
(Constraint) UQ_OrderItem_Order_Course: UNIQUE (OrderID, CourseID) - Mỗi khóa học chỉ xuất hiện 1 lần trong 1 đơn hàng

30. Bảng: ExchangeRates (Góp ý: Cần thiết cho đa tiền tệ)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
RateID BIGINT PK, IDENTITY(1,1)
FromCurrencyID VARCHAR(10) NOT NULL, FK -> Currencies(CurrencyID)
ToCurrencyID VARCHAR(10) NOT NULL, FK -> Currencies(CurrencyID)
Rate DECIMAL(36, 18) NOT NULL, CHECK (Rate > 0)
EffectiveTimestamp DATETIME2 NOT NULL, DEFAULT GETDATE(), IX (FromCurrencyID, ToCurrencyID, EffectiveTimestamp DESC)
Source NVARCHAR(100) NULL

31. Bảng: CoursePayments (Giao dịch thanh toán khóa học)
    Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
    PaymentID BIGINT IDENTITY(1,1) PRIMARY KEY
    OrderID BIGINT NOT NULL, UNIQUE, FK -> Orders(OrderID), INDEXED (IX_CoursePayments_OrderID)
    FinalAmount DECIMAL(18, 4) NOT NULL, Số tiền thực trả cho cả Order
    PaymentMethodID VARCHAR(20) NOT NULL, FK -> PaymentMethods(MethodID)
    OriginalCurrencyID VARCHAR(10) NOT NULL, FK -> Currencies(CurrencyID)
    OriginalAmount DECIMAL(36, 18) NOT NULL
    ExternalTransactionID VARCHAR(255) NULL, INDEXED (IX_CoursePayments_ExternalTransactionID) WHERE ExternalTransactionID IS NOT NULL
    ConvertedCurrencyID VARCHAR(10) NOT NULL, FK -> Currencies(CurrencyID)
    ConversionRate DECIMAL(24, 12) NULL
    ConvertedTotalAmount DECIMAL(18, 4) NOT NULL
    TransactionFee DECIMAL(18, 4) NOT NULL DEFAULT 0
    PaymentStatusID VARCHAR(20) NOT NULL DEFAULT 'PENDING', FK -> PaymentStatuses(StatusID), INDEXED (IX_CoursePayments_StatusID)
    TransactionCompletedAt DATETIME2 NULL
    AdditionalInfo NVARCHAR(MAX) NULL
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE()
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE()

32. Bảng: WithdrawalRequests (Yêu cầu rút tiền)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
RequestID BIGINT PK, IDENTITY(1,1)
InstructorID BIGINT NOT NULL, FK -> Accounts(AccountID), IX
RequestedAmount DECIMAL(18, 4) NOT NULL, CHECK (RequestedAmount > 0)
RequestedCurrencyID VARCHAR(10) NOT NULL, FK -> Currencies(CurrencyID)
PaymentMethodID VARCHAR(20) NOT NULL, FK -> PaymentMethods(MethodID)
PayoutDetailsSnapshot NVARCHAR(MAX) NOT NULL
Status VARCHAR(20) NOT NULL, DEFAULT 'PENDING', IX, CHECK (Status IN ('PENDING', 'APPROVED', ...))
InstructorNotes NVARCHAR(1000) NULL
AdminID BIGINT NULL, FK -> Accounts(AccountID)
AdminNotes NVARCHAR(1000) NULL
ProcessedAt DATETIME2 NULL
PayoutID BIGINT NULL, FK -> Payouts(PayoutID) ON DELETE SET NULL, IX
CreatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()
UpdatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()

34. Bảng: PayoutStatuses (Trạng thái chi trả)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
StatusID VARCHAR(20) PK, Ví dụ: 'PENDING', 'PROCESSING', 'PAID', 'FAILED'
StatusName NVARCHAR(100) NOT NULL

35. Bảng: Payouts (Lịch sử chi trả thực tế)
    Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
    PayoutID BIGINT PK, IDENTITY(1,1)
    InstructorID BIGINT NOT NULL, FK -> Accounts(AccountID), IX
    Amount DECIMAL(18, 4) NOT NULL
    CurrencyID VARCHAR(10) NOT NULL, FK -> Currencies(CurrencyID)
    ActualAmount DECIMAL(36, 18) NULL
    ExchangeRate DECIMAL(24, 12) NULL
    PaymentMethodID VARCHAR(20) NOT NULL, FK -> PaymentMethods(MethodID)
    PayoutDetails NVARCHAR(MAX) NULL
    Fee DECIMAL(18, 4) NOT NULL, DEFAULT 0.0000
    PayoutStatusID VARCHAR(20) NOT NULL, DEFAULT 'PENDING', FK -> PayoutStatuses(StatusID), IX
    RequestedAt DATETIME2 NOT NULL, DEFAULT GETDATE()
    ProcessedAt DATETIME2 NULL
    CompletedAt DATETIME2 NULL
    AdminID BIGINT NULL, FK -> Accounts(AccountID)
    AdminNote NVARCHAR(1000) NULL
    CreatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()
    UpdatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()

36. Bảng: CourseApprovalRequests (Yêu cầu phê duyệt khóa học)
    Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
    RequestID BIGINT PK, IDENTITY(1,1)
    CourseID BIGINT NOT NULL, FK -> Courses(CourseID) ON DELETE CASCADE, IX
    InstructorID BIGINT NOT NULL, FK -> Accounts(AccountID), IX
    RequestType VARCHAR(30) NOT NULL, CHECK (RequestType IN ('UPDATE_SUBMISSION', ...))
    Status VARCHAR(20) NOT NULL, DEFAULT 'PENDING', IX, CHECK (Status IN ('PENDING', 'APPROVED', ...))
    InstructorNotes NTEXT NULL
    AdminID BIGINT NULL, FK -> Accounts(AccountID)
    AdminNotes NTEXT NULL
    ReviewedAt DATETIME2 NULL
    CreatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()
    UpdatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()

37. Bảng: Notifications (Góp ý: Thêm mới)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
NotificationID BIGINT PK, IDENTITY(1,1)
RecipientAccountID BIGINT NOT NULL, FK -> Accounts(AccountID) ON DELETE CASCADE, IX
Type VARCHAR(50) NOT NULL, Ví dụ: 'COURSE_UPDATE'
Message NVARCHAR(MAX) NOT NULL
RelatedEntityType VARCHAR(50) NULL
RelatedEntityID VARCHAR(255) NULL
IsRead BIT NOT NULL, DEFAULT 0, IX (RecipientAccountID, IsRead, CreatedAt DESC)
CreatedAt DATETIME2 NOT NULL, DEFAULT GETDATE()

38. Bảng: Settings (Góp ý: Thêm mới)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
SettingKey VARCHAR(100) PK, NOT NULL, Ví dụ: 'PlatformCommissionRate'
SettingValue NVARCHAR(MAX) NOT NULL
Description NVARCHAR(500) NULL
IsEditableByAdmin BIT NOT NULL, DEFAULT 1
LastUpdated DATETIME2 NOT NULL, DEFAULT GETDATE()

39. Bảng: DiscussionThreads (Chủ đề thảo luận/Câu hỏi gốc)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
ThreadID BIGINT IDENTITY(1,1) PRIMARY KEY
CourseID BIGINT NOT NULL, FK -> Courses(CourseID) ON DELETE CASCADE, Part of INDEX (IX_DiscussionThreads_CourseLesson)
LessonID BIGINT NULL, FK -> Lessons(LessonID) ON DELETE SET NULL, Part of INDEX (IX_DiscussionThreads_CourseLesson)
Title NVARCHAR(500) NOT NULL, Tiêu đề chủ đề/câu hỏi
CreatedByAccountID BIGINT NOT NULL, FK -> Accounts(AccountID), INDEXED (IX_DiscussionThreads_CreatedBy)
CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE()
UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE()

40.  Bảng: DiscussionPosts (Bài viết/Trả lời trong một chủ đề)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
PostID BIGINT IDENTITY(1,1) PRIMARY KEY
ThreadID BIGINT NOT NULL, FK -> DiscussionThreads(ThreadID) ON DELETE CASCADE, Part of INDEX (IX_DiscussionPosts_ThreadCreatedAt)
ParentPostID BIGINT NULL, FK -> DiscussionPosts(PostID) (Không CASCADE), INDEXED (IX_DiscussionPosts_ParentPost) WHERE ParentPostID IS NOT NULL
AccountID BIGINT NOT NULL, FK -> Accounts(AccountID), INDEXED (IX_DiscussionPosts_Account)
PostText NVARCHAR(MAX) NOT NULL, Nội dung bài viết
IsInstructorPost BIT NOT NULL DEFAULT 0, Đánh dấu nếu do Giảng viên đăng
CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(), Part of INDEX (IX_DiscussionPosts_ThreadCreatedAt)
UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE()

41. Bảng: InstructorBalanceTransactions (Lịch sử Giao dịch Số dư Giảng viên)

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
TransactionID BIGINT IDENTITY(1,1) PRIMARY KEY
AccountID BIGINT NOT NULL, FK -> Accounts(AccountID) ON DELETE NO ACTION (Giảng viên)
Type VARCHAR(30) NOT NULL, CHECK (Type IN ('CREDIT_SALE', 'DEBIT_WITHDRAWAL', 'CREDIT_REFUND', 'DEBIT_FEE', 'ADJUSTMENT_ADD', 'ADJUSTMENT_SUB'))
Amount DECIMAL(18, 4) NOT NULL, Số tiền thay đổi (+ credit, - debit)
CurrencyID VARCHAR(10) NOT NULL, FK -> Currencies(CurrencyID) (Thường là 'VND')
CurrentBalance DECIMAL(18, 4) NOT NULL, Số dư của giảng viên SAU giao dịch này
RelatedEntityType VARCHAR(50) NULL, Bảng liên quan (vd: 'PaymentSplit', 'Payout')
RelatedEntityID BIGINT NULL, ID của bản ghi liên quan
Description NVARCHAR(500) NULL, Mô tả thêm (tùy chọn)
TransactionTimestamp DATETIME2 NOT NULL DEFAULT GETDATE(), Thời điểm giao dịch
PaymentID FK -> Payment

42. InstructorPayoutMethods 

Tên cột Kiểu dữ liệu Ràng buộc/Ghi chú
PayoutMethodID BIGINT IDENTITY(1,1) PRIMARY KEY
AccountID BIGINT NOT NULL, FK -> Accounts(AccountID) ON DELETE CASCADE, Part of UNIQUE (UQ_InstructorPayoutMethod_Account_Method)
MethodID VARCHAR(20) NOT NULL, FK -> PaymentMethods(MethodID), Part of UNIQUE (UQ_InstructorPayoutMethod_Account_Method)
Details NVARCHAR(MAX) NOT NULL, Lưu trữ chi tiết cấu hình dưới dạng JSON (vd: {"email": "..."} cho PayPal, {"bank": "...", ...} cho Bank)
IsPrimary BIT NOT NULL DEFAULT 0, Đánh dấu là phương thức nhận tiền chính
Status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', CHECK (Status IN ('ACTIVE', 'INACTIVE', 'REQUIRES_VERIFICATION'))
CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE()
UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE()
(Constraint) UQ_InstructorPayoutMethod_Account_Method: UNIQUE (AccountID, MethodID) - Mỗi GV chỉ có 1 cấu hình cho mỗi loại phương thức

# Thông tin thẻ Ghi chú

1
Ngân hàng: NCB
Số thẻ: 9704198526191432198
Tên chủ thẻ:NGUYEN VAN A
Ngày phát hành:07/15
Mật khẩu OTP:123456
Thành công
2
Ngân hàng: NCB
Số thẻ: 9704195798459170488
Tên chủ thẻ:NGUYEN VAN A
Ngày phát hành:07/15
Thẻ không đủ số dư
3
Ngân hàng: NCB
Số thẻ: 9704192181368742
Tên chủ thẻ:NGUYEN VAN A
Ngày phát hành:07/15
Thẻ chưa kích hoạt
4
Ngân hàng: NCB
Số thẻ: 9704193370791314
Tên chủ thẻ:NGUYEN VAN A
Ngày phát hành:07/15
Thẻ bị khóa
