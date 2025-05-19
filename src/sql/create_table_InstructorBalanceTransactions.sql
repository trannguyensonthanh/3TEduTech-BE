-- Bảng mới: InstructorBalanceTransactions
USE ThreeTEduTechLMS;

GO PRINT 'Creating Table: InstructorBalanceTransactions...';

CREATE TABLE
  InstructorBalanceTransactions (
    TransactionID BIGINT IDENTITY (1, 1) NOT NULL, -- Khóa chính tự tăng
    AccountID BIGINT NOT NULL, -- FK -> Accounts(AccountID) (Instructor)
    Type VARCHAR(30) NOT NULL, -- Loại giao dịch: 'CREDIT_SALE', 'DEBIT_WITHDRAWAL', 'CREDIT_REFUND', 'DEBIT_FEE', 'ADJUSTMENT_ADD', 'ADJUSTMENT_SUB' ...
    Amount DECIMAL(18, 4) NOT NULL, -- Số tiền thay đổi (+ cho credit, - cho debit)
    CurrencyID VARCHAR(10) NOT NULL, -- FK -> Currencies(CurrencyID) (Nên là tiền tệ gốc của hệ thống, vd: VND)
    CurrentBalance DECIMAL(18, 4) NOT NULL, -- Số dư của instructor SAU giao dịch này
    RelatedEntityType VARCHAR(50) NULL, -- Bảng liên quan (vd: 'PaymentSplit', 'Payout')
    RelatedEntityID BIGINT NULL, -- ID của bản ghi liên quan
    Description NVARCHAR (500) NULL, -- Mô tả thêm về giao dịch (optional)
    TransactionTimestamp DATETIME2 NOT NULL DEFAULT GETDATE (), -- Thời gian giao dịch
    CONSTRAINT PK_InstructorBalanceTransactions PRIMARY KEY (TransactionID),
    CONSTRAINT FK_InstructorBalanceTransactions_AccountID FOREIGN KEY (AccountID) REFERENCES Accounts (AccountID) ON DELETE NO ACTION, -- Giữ lại lịch sử GD nếu instructor bị xóa?
    CONSTRAINT FK_InstructorBalanceTransactions_CurrencyID FOREIGN KEY (CurrencyID) REFERENCES Currencies (CurrencyID),
    CONSTRAINT CK_InstructorBalanceTransactions_Type CHECK (
      Type IN (
        'CREDIT_SALE',
        'DEBIT_WITHDRAWAL',
        'CREDIT_REFUND',
        'DEBIT_FEE',
        'ADJUSTMENT_ADD',
        'ADJUSTMENT_SUB'
      )
    ) -- Thêm các type khác nếu cần
    -- Không cần check Amount > 0 vì có thể là số âm (DEBIT)
  );

GO
-- Index quan trọng để lấy giao dịch cuối cùng và tính tổng
CREATE INDEX IX_InstructorBalanceTransactions_Account_Timestamp ON InstructorBalanceTransactions (AccountID, TransactionTimestamp DESC);

CREATE INDEX IX_InstructorBalanceTransactions_RelatedEntity ON InstructorBalanceTransactions (RelatedEntityType, RelatedEntityID)
WHERE
  RelatedEntityType IS NOT NULL
  AND RelatedEntityID IS NOT NULL;

PRINT 'InstructorBalanceTransactions table created.';

GO
-- (Optional but recommended) Thêm Trigger hoặc Stored Procedure để đảm bảo tính nhất quán của CurrentBalance
-- Trigger này sẽ tự động tính CurrentBalance khi INSERT một dòng mới
/*
PRINT 'Creating Trigger TR_InstructorBalanceTransactions_CalculateBalance...';
GO
CREATE TRIGGER TR_InstructorBalanceTransactions_CalculateBalance
ON InstructorBalanceTransactions
AFTER INSERT
AS
BEGIN
SET NOCOUNT ON;

DECLARE @AccountID BIGINT;
DECLARE @Amount DECIMAL(18, 4);
DECLARE @TransactionID BIGINT;
DECLARE @PreviousBalance DECIMAL(18, 4);
DECLARE @NewBalance DECIMAL(18, 4);

-- Lấy thông tin từ dòng vừa insert (giả sử chỉ insert 1 dòng mỗi lần)
SELECT @AccountID = i.AccountID, @Amount = i.Amount, @TransactionID = i.TransactionID
FROM inserted i;

-- Lấy số dư của giao dịch gần nhất TRƯỚC giao dịch hiện tại
SELECT TOP 1 @PreviousBalance = CurrentBalance
FROM InstructorBalanceTransactions
WHERE AccountID = @AccountID AND TransactionID < @TransactionID
ORDER BY TransactionTimestamp DESC, TransactionID DESC;

-- Nếu không có giao dịch trước đó, số dư trước đó là 0
SET @PreviousBalance = ISNULL(@PreviousBalance, 0);

-- Tính số dư mới
SET @NewBalance = @PreviousBalance + @Amount;

-- Cập nhật lại CurrentBalance cho dòng vừa insert
UPDATE InstructorBalanceTransactions
SET CurrentBalance = @NewBalance
WHERE TransactionID = @TransactionID;

END
GO
PRINT 'Trigger TR_InstructorBalanceTransactions_CalculateBalance created.';
GO
 */
-- LƯU Ý QUAN TRỌNG VỀ TRIGGER:
-- 1. Trigger trên có thể không xử lý tốt trường hợp INSERT nhiều dòng cùng lúc. Cần sửa lại nếu có bulk insert.
-- 2. Trigger có thể ảnh hưởng hiệu năng INSERT.
-- 3. Cách khác là tính toán CurrentBalance trong Stored Procedure hoặc trong code Service (cần đảm bảo tính đúng đắn).
-- --> Để đơn giản ban đầu, chúng ta sẽ tính CurrentBalance trong Service và lưu vào khi INSERT.