USE ThreeTEduTechLMS;
GO

BEGIN TRANSACTION;

BEGIN TRY
    PRINT 'Step 1: Adding columns to InstructorBalanceTransactions...';
    -- Thêm cột PaymentID (FK đến CoursePayments)
    IF COL_LENGTH('dbo.InstructorBalanceTransactions', 'PaymentID') IS NULL
    BEGIN
        ALTER TABLE dbo.InstructorBalanceTransactions
        ADD PaymentID BIGINT NULL; -- Cho phép NULL ban đầu để không lỗi với dữ liệu cũ hoặc các type khác không có payment

        ALTER TABLE dbo.InstructorBalanceTransactions
        ADD CONSTRAINT FK_IBT_PaymentID FOREIGN KEY (PaymentID) REFERENCES CoursePayments(PaymentID)
        ON DELETE SET NULL; -- Nếu payment bị xóa (hiếm), thì chỉ set null ở đây
        PRINT 'Column PaymentID added to InstructorBalanceTransactions with FK.';
    END
    ELSE
    BEGIN
        PRINT 'Column PaymentID already exists in InstructorBalanceTransactions.';
    END

    -- Thêm cột OrderItemID (FK đến OrderItems)
    IF COL_LENGTH('dbo.InstructorBalanceTransactions', 'OrderItemID') IS NULL
    BEGIN
        ALTER TABLE dbo.InstructorBalanceTransactions
        ADD OrderItemID BIGINT NULL; -- Cho phép NULL ban đầu

        ALTER TABLE dbo.InstructorBalanceTransactions
        ADD CONSTRAINT FK_IBT_OrderItemID FOREIGN KEY (OrderItemID) REFERENCES OrderItems(OrderItemID)
        ON DELETE SET NULL; -- Nếu order item bị xóa (hiếm), thì chỉ set null
        PRINT 'Column OrderItemID added to InstructorBalanceTransactions with FK.';
    END
    ELSE
    BEGIN
        PRINT 'Column OrderItemID already exists in InstructorBalanceTransactions.';
    END

    -- Cập nhật lại RelatedEntityType và RelatedEntityID cho các giao dịch CREDIT_SALE hiện có (NẾU ĐÃ CÓ DỮ LIỆU)
    -- Giả định trước đó bạn lưu SplitID vào RelatedEntityID và Type là 'PaymentSplit'
    -- Bước này cần rất cẩn thận và tùy chỉnh theo dữ liệu hiện tại của bạn.
    -- Nếu chưa có dữ liệu hoặc dữ liệu không khớp, BỎ QUA PHẦN UPDATE NÀY.
    /*
    PRINT 'Attempting to migrate existing CREDIT_SALE transactions...';
    UPDATE ibt
    SET
        ibt.RelatedEntityType = 'OrderItem',
        ibt.RelatedEntityID = ps.OrderItemID, -- Lấy OrderItemID từ PaymentSplits
        ibt.PaymentID = ps.PaymentID          -- Lấy PaymentID từ PaymentSplits
    FROM
        InstructorBalanceTransactions ibt
    INNER JOIN
        PaymentSplits ps ON ibt.RelatedEntityType = 'PaymentSplit' AND ibt.RelatedEntityID = ps.SplitID
    WHERE
        ibt.Type = 'CREDIT_SALE';
    PRINT 'Migration of existing CREDIT_SALE transactions attempted.';
    */


    PRINT 'Step 2: Dropping table PaymentSplits...';
    -- Xóa các Foreign Key tham chiếu đến PaymentSplits trước (nếu có, ví dụ từ InstructorBalanceTransactions cũ)
    IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE referenced_object_id = OBJECT_ID('dbo.PaymentSplits'))
    BEGIN
        DECLARE @fk_name NVARCHAR(MAX);
        DECLARE @parent_table_name NVARCHAR(MAX);
        DECLARE cur CURSOR FOR
            SELECT
                name,
                OBJECT_NAME(parent_object_id)
            FROM sys.foreign_keys
            WHERE referenced_object_id = OBJECT_ID('dbo.PaymentSplits');

        OPEN cur;
        FETCH NEXT FROM cur INTO @fk_name, @parent_table_name;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            PRINT 'Dropping FK: ' + @fk_name + ' from table ' + @parent_table_name;
            EXEC('ALTER TABLE dbo.[' + @parent_table_name + '] DROP CONSTRAINT [' + @fk_name + ']');
            FETCH NEXT FROM cur INTO @fk_name, @parent_table_name;
        END
        CLOSE cur;
        DEALLOCATE cur;
    END

    -- Xóa bảng PaymentSplits
    IF OBJECT_ID('dbo.PaymentSplits', 'U') IS NOT NULL
    BEGIN
        DROP TABLE dbo.PaymentSplits;
        PRINT 'Table PaymentSplits dropped.';
    END
    ELSE
    BEGIN
        PRINT 'Table PaymentSplits does not exist or already dropped.';
    END


    PRINT 'Step 3: Updating CHECK constraint for InstructorBalanceTransactions.Type (nếu cần)...';
    -- Xóa constraint cũ nếu nó có 'PaymentSplit'
    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_InstructorBalanceTransactions_Type' AND definition LIKE '%PaymentSplit%')
    BEGIN
        ALTER TABLE dbo.InstructorBalanceTransactions DROP CONSTRAINT CK_InstructorBalanceTransactions_Type;
        PRINT 'Old CHECK constraint CK_InstructorBalanceTransactions_Type dropped.';
    END
    -- Thêm constraint mới (nếu chưa có hoặc vừa xóa)
    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_InstructorBalanceTransactions_Type_V2' AND parent_object_id = OBJECT_ID('dbo.InstructorBalanceTransactions'))
    BEGIN
        ALTER TABLE dbo.InstructorBalanceTransactions
        ADD CONSTRAINT CK_InstructorBalanceTransactions_Type_V2 CHECK (Type IN ('CREDIT_SALE', 'DEBIT_WITHDRAWAL', 'CREDIT_REFUND', 'DEBIT_FEE', 'ADJUSTMENT_ADD', 'ADJUSTMENT_SUB'));
        PRINT 'New CHECK constraint CK_InstructorBalanceTransactions_Type_V2 added.';
    END
    ELSE
    BEGIN
         PRINT 'CHECK constraint for Type (CK_InstructorBalanceTransactions_Type_V2) already exists or name conflicts.';
    END


    COMMIT TRANSACTION;
    PRINT 'Database schema updated successfully.';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    PRINT 'Error occurred during schema update:';
    PRINT ERROR_MESSAGE();
    PRINT ERROR_LINE();
    -- RAISERROR('Failed to update schema.', 16, 1);
END CATCH
GO