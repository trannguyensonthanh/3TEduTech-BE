// src/utils/caseConverter.js
const _ = require('lodash');

/**
 * Chuyển đổi key của một object (hoặc các object trong mảng) sang một case cụ thể.
 * @param {any} data - Dữ liệu đầu vào (object, array, hoặc giá trị nguyên thủy).
 * @param {(str: string) => string} keyTransformer - Hàm để chuyển đổi một key string.
 * @param {boolean} [isToPascalWithSpecialID=false] - Cờ đặc biệt cho toPascalCase để xử lý 'Id' -> 'ID'.
 * @param {boolean} [isToCamelWithSpecialID=false] - Cờ đặc biệt cho toCamelCase để xử lý 'ID' -> 'Id'.
 * @returns {any} - Dữ liệu đã được chuyển đổi key.
 */
function convertObjectKeys(
  data,
  keyTransformer,
  isToPascalWithSpecialID = false,
  isToCamelWithSpecialID = false
) {
  if (Array.isArray(data)) {
    return data.map((item) =>
      convertObjectKeys(
        item,
        keyTransformer,
        isToPascalWithSpecialID,
        isToCamelWithSpecialID
      )
    );
  }
  if (
    data !== null &&
    typeof data === 'object' &&
    !(data instanceof Date) &&
    !(data instanceof RegExp) &&
    !(typeof Buffer !== 'undefined' && data instanceof Buffer)
  ) {
    const newObj = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        let newKey = keyTransformer(key);

        // Xử lý đặc biệt cho 'Id' -> 'ID' khi chuyển sang PascalCase
        if (
          isToPascalWithSpecialID &&
          newKey.endsWith('Id') &&
          key.length > 2
        ) {
          newKey = `${newKey.slice(0, -2)}ID`;
        }

        // Xử lý đặc biệt cho 'ID' -> 'Id' khi chuyển sang CamelCase
        if (isToCamelWithSpecialID && newKey.endsWith('ID') && key.length > 2) {
          // Đảm bảo không phải chỉ là 'ID'
          // _.camelCase('UserID') sẽ ra 'userId', nên logic này có thể không cần nếu _.camelCase đã xử lý đúng
          // Tuy nhiên, nếu key gốc là 'UserID' và keyTransformer là identity, thì cần:
          if (key.endsWith('ID')) {
            newKey = `${key.slice(0, -2)}Id`;
          }
        }
        // Nếu keyTransformer là _.camelCase, nó đã tự xử lý 'UserID' -> 'userId' rồi.
        // Logic isToCamelWithSpecialID ở trên chủ yếu hữu ích nếu keyTransformer không phải là _.camelCase
        // hoặc nếu bạn muốn đảm bảo 'ANYTHINGID' -> 'anythingId' thay vì 'anythingiD' (do lodash camelCase)

        newObj[newKey] = convertObjectKeys(
          data[key],
          keyTransformer,
          isToPascalWithSpecialID,
          isToCamelWithSpecialID
        );
      }
    }
    return newObj;
  }
  return data;
}

/**
 * Chuyển đổi tất cả các key trong một object (hoặc mảng các object) sang camelCase.
 * Xử lý đặc biệt: 'AnythingID' (PascalCase) -> 'anythingId' (camelCase).
 * @param {any} data - Dữ liệu đầu vào (thường từ DB với PascalCase).
 * @returns {any} - Dữ liệu với các key đã được chuyển sang camelCase.
 */
const toCamelCaseObject = (data) => {
  const customCamelCaseTransformer = (key) => {
    // Nếu key kết thúc bằng 'ID' và chữ cái ngay trước 'ID' là viết hoa (ví dụ: UserID, SectionDetailID)
    // và key không phải chỉ là 'ID'
    if (
      key.endsWith('ID') &&
      key.length > 2 &&
      key[key.length - 3] === key[key.length - 3].toUpperCase()
    ) {
      // Chuyển phần đầu về camelCase, sau đó nối với 'Id'
      const prefix = key.slice(0, -2);
      return `${_.camelCase(prefix)}Id`;
    }
    // Các trường hợp khác, dùng _.camelCase bình thường
    return _.camelCase(key);
  };
  return convertObjectKeys(data, customCamelCaseTransformer);
};

/**
 * Chuyển đổi tất cả các key trong một object (hoặc mảng các object) sang PascalCase.
 * Xử lý đặc biệt: 'anythingId' -> 'AnythingID'.
 * @param {any} data - Dữ liệu đầu vào (thường từ Service Layer với camelCase).
 * @returns {any} - Dữ liệu với các key đã được chuyển sang PascalCase.
 */
const toPascalCaseObject = (data) => {
  const customPascalCaseTransformer = (key) => {
    let pascalKey = _.upperFirst(_.camelCase(key)); // Chuẩn hóa về Pascal cơ bản
    // Nếu key gốc kết thúc bằng 'Id' (sau khi đã camelCase hóa) thì chuyển 'Id' thành 'ID'
    if (
      key.toLowerCase().endsWith('id') &&
      pascalKey.endsWith('Id') &&
      pascalKey.length > 2
    ) {
      pascalKey = `${pascalKey.slice(0, -2)}ID`;
    }
    return pascalKey;
  };
  return convertObjectKeys(data, customPascalCaseTransformer);
};

/**
 * Chuyển đổi tất cả các key trong một object (hoặc mảng các object) sang snake_case.
 * @param {any} data - Dữ liệu đầu vào.
 * @returns {any} - Dữ liệu với các key đã được chuyển sang snake_case.
 */
const toSnakeCaseObject = (data) => {
  return convertObjectKeys(data, _.snakeCase);
};

module.exports = {
  toCamelCaseObject,
  toPascalCaseObject,
  toSnakeCaseObject,
  // convertObjectKeys, // Có thể không cần export hàm gốc nữa
};
