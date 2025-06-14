// File: src/services/event.manager.js (Tạo file mới)

const logger = require('../utils/logger');

const clients = new Map();

/**
 * Thêm một client (kết nối SSE) vào danh sách quản lý.
 * @param {number} accountId - ID của người dùng.
 * @param {object} res - Đối tượng response của Express.
 */
function addClient(accountId, res) {
  if (!clients.has(accountId)) {
    clients.set(accountId, new Set());
  }
  clients.get(accountId).add(res);
  logger.info(
    `SSE client connected: User ${accountId}. Total connections for user: ${clients.get(accountId).size}`
  );
}

/**
 * Xóa một client khỏi danh sách khi họ ngắt kết nối.
 * @param {number} accountId - ID của người dùng.
 * @param {object} res - Đối tượng response của Express.
 */
function removeClient(accountId, res) {
  if (clients.has(accountId)) {
    const userClients = clients.get(accountId);
    userClients.delete(res);

    // Nếu user không còn kết nối nào, xóa luôn key khỏi Map để tiết kiệm bộ nhớ
    if (userClients.size === 0) {
      clients.delete(accountId);
    }
    logger.info(
      `SSE client disconnected: User ${accountId}. Remaining connections: ${userClients.size}`
    );
  }
}

/**
 * Gửi một sự kiện đến MỘT người dùng cụ thể.
 * @param {string | number} accountId - ID của người dùng nhận sự kiện.
 * @param {string} eventName - Tên của sự kiện.
 * @param {object} data - Dữ liệu cần gửi.
 */
function sendEventToUser(accountId, eventName, data) {
  const key = String(accountId);

  // Thêm log để debug
  logger.debug(
    `[EventManager] Attempting to send event '${eventName}' to user '${key}'.`
  );
  logger.debug(
    `[EventManager] Current client keys: [${Array.from(clients.keys()).join(', ')}]`
  );

  if (clients.has(key)) {
    const userClients = clients.get(key);
    const message = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;

    logger.info(
      `Sending SSE event '${eventName}' to User ${key} (${userClients.size} connections)`
    );
    logger.debug(`SSE event data for user ${key}:`, data);

    userClients.forEach((res) => {
      res.write(message);
    });
  } else {
    logger.warn(
      `[EventManager] No active SSE connections found for user ${key}. Event '${eventName}' was not sent.`
    );
  }
}

/**
 * Gửi một sự kiện đến một hoặc nhiều người dùng cụ thể.
 * @param {Array<number>|number} accountIds - Một ID hoặc một mảng các ID người dùng.
 * @param {string} eventName - Tên của sự kiện (ví dụ: 'course_reviewed').
 * @param {object} data - Dữ liệu cần gửi (sẽ được JSON.stringify).
 */
function sendEventToUsers(accountIds, eventName, data) {
  const userIds = Array.isArray(accountIds) ? accountIds : [accountIds];

  userIds.forEach((accountId) => {
    if (clients.has(accountId)) {
      const userClients = clients.get(accountId);

      // Định dạng message theo chuẩn SSE
      const message = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;

      logger.info(
        `Sending SSE event '${eventName}' to User ${accountId} (${userClients.size} connections)`
      );
      logger.debug(`SSE event data:`, data);

      userClients.forEach((res) => {
        res.write(message);
      });
    }
  });
}

module.exports = {
  addClient,
  removeClient,
  sendEventToUsers,
  sendEventToUser,
};
