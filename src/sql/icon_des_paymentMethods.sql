USE ThreeTEduTechLMS;

GO PRINT 'Updating PaymentMethods table...';

-- Thêm cột IconUrl
IF COL_LENGTH ('dbo.PaymentMethods', 'IconUrl') IS NULL BEGIN
ALTER TABLE dbo.PaymentMethods ADD IconUrl VARCHAR(500) NULL;

-- URL đến file icon
PRINT 'Column IconUrl added to PaymentMethods table.';

END ELSE BEGIN PRINT 'Column IconUrl already exists in PaymentMethods table.';

END GO
-- Thêm cột Description
IF COL_LENGTH ('dbo.PaymentMethods', 'Description') IS NULL BEGIN
ALTER TABLE dbo.PaymentMethods ADD Description NVARCHAR (255) NULL;

-- Mô tả ngắn
PRINT 'Column Description added to PaymentMethods table.';

END ELSE BEGIN PRINT 'Column Description already exists in PaymentMethods table.';

END GO
-- (Optional) Cập nhật dữ liệu cho các phương thức đã có
PRINT 'Updating existing payment methods with icons and descriptions...';

UPDATE PaymentMethods
SET
  IconUrl = 'https://path.to/your/icons/momo.png', -- Thay bằng URL icon thực tế
  Description = N'Thanh toán an toàn và nhanh chóng qua ví điện tử MoMo.'
WHERE
  MethodID = 'MOMO'
  AND (
    IconUrl IS NULL
    OR Description IS NULL
  );

-- Chỉ update nếu chưa có
UPDATE PaymentMethods
SET
  IconUrl = 'https://path.to/your/icons/vnpay.png', -- Thay bằng URL icon thực tế
  Description = N'Hỗ trợ thẻ ATM nội địa, thẻ quốc tế (Visa, Master, JCB, Amex), và VNPAY-QR.'
WHERE
  MethodID = 'VNPAY'
  AND (
    IconUrl IS NULL
    OR Description IS NULL
  );

UPDATE PaymentMethods
SET
  IconUrl = 'https://path.to/your/icons/bank_transfer.png', -- Thay bằng URL icon thực tế
  Description = N'Chuyển khoản trực tiếp đến tài khoản ngân hàng của chúng tôi.'
WHERE
  MethodID = 'BANK_TRANSFER'
  AND (
    IconUrl IS NULL
    OR Description IS NULL
  );

UPDATE PaymentMethods
SET
  IconUrl = 'https://path.to/your/icons/system_credit.png', -- Thay bằng URL icon thực tế
  Description = N'Sử dụng số dư tín dụng có sẵn trong tài khoản của bạn.'
WHERE
  MethodID = 'SYSTEM_CREDIT'
  AND (
    IconUrl IS NULL
    OR Description IS NULL
  );

UPDATE PaymentMethods
SET
  IconUrl = 'https://path.to/your/icons/paypal.png', -- Thay bằng URL icon PayPal thực tế
  Description = N'Thanh toán an toàn bằng tài khoản PayPal của bạn.'
WHERE
  MethodID = 'PAYPAL'
  AND (
    IconUrl IS NULL
    OR Description IS NULL
  );

PRINT 'PaymentMethods table updated.';

GO
-- Kiểm tra lại cấu trúc
-- EXEC sp_help 'dbo.PaymentMethods';
-- GO
-- SELECT * FROM PaymentMethods;
-- GO