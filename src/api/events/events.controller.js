// File: src/api/events/events.controller.js (Tạo file mới)

const eventManager = require('../../services/event.manager');
const { catchAsync } = require('../../utils/catchAsync');

const subscribe = catchAsync(async (req, res) => {
  const accountId = req.user.id;

  // Thiết lập các header cần thiết cho SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // Gửi headers ngay lập tức

  // Gửi một comment để mở kết nối
  res.write(': Connection opened\n\n');

  // Thêm client vào manager
  eventManager.addClient(accountId, res);

  // Thiết lập heartbeat để giữ kết nối sống (ví dụ: mỗi 20 giây)
  const heartbeatInterval = setInterval(() => {
    res.write(': a keep-alive comment\n\n');
  }, 20000);

  // Xử lý khi client ngắt kết nối
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    eventManager.removeClient(accountId, res);
    res.end();
  });
});

module.exports = {
  subscribe,
};
