// .eslintrc.js
module.exports = {
  env: {
    node: true, // Môi trường Node.js
    es2021: true, // Hỗ trợ cú pháp ES2021
    jest: true, // Nếu bạn dùng Jest để test
  },
  extends: [
    'airbnb-base', // Bộ quy tắc Airbnb cơ bản (không gồm React)
    'plugin:prettier/recommended', // Tích hợp Prettier vào ESLint
  ],
  plugins: ['prettier'],
  parserOptions: {
    ecmaVersion: 12, // Tương đương ES2021
    sourceType: 'module',
  },
  rules: {
    'prettier/prettier': 'warn', // Báo warning nếu code không khớp Prettier
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off', // Cảnh báo console.log ở production
    'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'import/prefer-default-export': 'off', // Tắt quy tắc yêu cầu export default
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_|req|res|next' }], // Cảnh báo biến không dùng (bỏ qua _ và params của Express)
    'no-underscore-dangle': 'off', // Cho phép dấu gạch dưới ở đầu biến (vd: _private)
    'class-methods-use-this': 'off', // Cho phép phương thức class không dùng 'this'
    'consistent-return': 'off', // Cho phép hàm không luôn trả về giá trị
    'no-shadow': 'off', // Có thể cần tùy chỉnh nếu bạn thích shadow variable
    'no-param-reassign': ['warn', { props: false }], // Cho phép gán lại thuộc tính của param (vd: req.user)
    // Thêm các quy tắc bạn muốn ghi đè hoặc tắt ở đây
    'no-restricted-syntax': 'off',
    'no-await-in-loop': 'off',
  },
};
