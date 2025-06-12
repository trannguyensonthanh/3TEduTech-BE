/**
 * Tạo OrderID duy nhất.
 * @returns {string} - OrderID duy nhất.
 */
export const generateUniqueOrderId = () => {
  const timestamp = Date.now();
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `${timestamp}${randomPart}`;
};
