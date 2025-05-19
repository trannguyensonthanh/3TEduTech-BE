/**
 * Tạo OrderID duy nhất.
 * @returns {string} - OrderID duy nhất.
 */
export const generateUniqueOrderId = () => {
  const timestamp = Date.now(); // Lấy timestamp hiện tại (millisecond)
  const randomPart = Math.floor(1000 + Math.random() * 9000); // Tạo số ngẫu nhiên 4 chữ số
  return `${timestamp}${randomPart}`; // Kết hợp timestamp và số ngẫu nhiên
};
