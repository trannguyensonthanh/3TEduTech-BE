USE ThreeTEduTechLMS;

GO
-- Lập trình & Phát triển Web
INSERT INTO
  Skills (SkillName, Description)
VALUES
  (
    N'Python',
    N'Ngôn ngữ lập trình đa năng, phổ biến trong khoa học dữ liệu, web và tự động hóa.'
  ),
  (
    N'JavaScript',
    N'Ngôn ngữ lập trình thiết yếu cho phát triển web frontend và backend (Node.js).'
  ),
  (
    N'React.js',
    N'Thư viện JavaScript phổ biến để xây dựng giao diện người dùng.'
  ),
  (
    N'Node.js',
    N'Môi trường chạy JavaScript phía máy chủ để xây dựng ứng dụng web backend.'
  ),
  (
    N'HTML',
    N'Ngôn ngữ đánh dấu siêu văn bản, cấu trúc cơ bản của trang web.'
  ),
  (
    N'CSS',
    N'Ngôn ngữ định dạng cho trang web, kiểm soát giao diện và bố cục.'
  ),
  (
    N'SQL',
    N'Ngôn ngữ truy vấn có cấu trúc để quản lý và thao tác cơ sở dữ liệu quan hệ.'
  ),
  (
    N'Java',
    N'Ngôn ngữ lập trình hướng đối tượng mạnh mẽ, dùng trong ứng dụng doanh nghiệp, Android.'
  ),
  (
    N'C#',
    N'Ngôn ngữ lập trình của Microsoft, phổ biến cho phát triển ứng dụng Windows và game (Unity).'
  ),
  (
    N'PHP',
    N'Ngôn ngữ kịch bản phía máy chủ phổ biến cho phát triển web.'
  );

-- Khoa học Dữ liệu & AI
INSERT INTO
  Skills (SkillName, Description)
VALUES
  (
    N'Machine Learning',
    N'Lĩnh vực trí tuệ nhân tạo tập trung vào việc xây dựng hệ thống học hỏi từ dữ liệu.'
  ),
  (
    N'Data Analysis',
    N'Quá trình kiểm tra, làm sạch, chuyển đổi và mô hình hóa dữ liệu để khám phá thông tin hữu ích.'
  ),
  (
    N'Data Visualization',
    N'Trực quan hóa dữ liệu bằng biểu đồ, đồ thị để truyền đạt thông tin hiệu quả.'
  ),
  (
    N'Deep Learning',
    N'Một nhánh của Machine Learning sử dụng mạng nơ-ron nhân tạo sâu.'
  );

-- Thiết kế
INSERT INTO
  Skills (SkillName, Description)
VALUES
  (
    N'UI Design',
    N'Thiết kế giao diện người dùng, tập trung vào thẩm mỹ và tương tác hình ảnh.'
  ),
  (
    N'UX Design',
    N'Thiết kế trải nghiệm người dùng, tập trung vào sự dễ sử dụng và hài lòng của người dùng.'
  ),
  (
    N'Figma',
    N'Công cụ thiết kế giao diện và tạo mẫu cộng tác dựa trên nền tảng web.'
  ),
  (
    N'Adobe Photoshop',
    N'Phần mềm chỉnh sửa ảnh và thiết kế đồ họa raster hàng đầu.'
  ),
  (
    N'Graphic Design',
    N'Thiết kế đồ họa, tạo ra các yếu tố hình ảnh như logo, banner, ấn phẩm.'
  );

-- Kinh doanh & Marketing
INSERT INTO
  Skills (SkillName, Description)
VALUES
  (
    N'Digital Marketing',
    N'Tiếp thị sản phẩm/dịch vụ sử dụng các kênh kỹ thuật số.'
  ),
  (
    N'SEO',
    N'Tối ưu hóa công cụ tìm kiếm để tăng thứ hạng và lưu lượng truy cập tự nhiên.'
  ),
  (
    N'Project Management',
    N'Quản lý dự án, lập kế hoạch, thực thi và giám sát để đạt được mục tiêu cụ thể.'
  ),
  (
    N'Business Analysis',
    N'Phân tích nghiệp vụ, xác định nhu cầu kinh doanh và đề xuất giải pháp.'
  );

-- Cloud & DevOps
INSERT INTO
  Skills (SkillName, Description)
VALUES
  (
    N'Amazon Web Services (AWS)',
    N'Nền tảng điện toán đám mây hàng đầu của Amazon.'
  ),
  (
    N'Microsoft Azure',
    N'Nền tảng điện toán đám mây của Microsoft.'
  ),
  (N'Docker', N'Nền tảng container hóa ứng dụng.'),
  (
    N'DevOps',
    N'Triết lý và thực hành kết hợp phát triển phần mềm (Dev) và vận hành IT (Ops).'
  );

-- Kỹ năng mềm
INSERT INTO
  Skills (SkillName, Description)
VALUES
  (
    N'Communication Skills',
    N'Kỹ năng giao tiếp hiệu quả trong môi trường làm việc và cá nhân.'
  ),
  (
    N'Leadership',
    N'Kỹ năng lãnh đạo, dẫn dắt và truyền cảm hứng cho đội nhóm.'
  );

GO