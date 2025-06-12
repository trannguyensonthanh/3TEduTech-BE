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

        if (
          isToPascalWithSpecialID &&
          newKey.endsWith('Id') &&
          key.length > 2
        ) {
          newKey = `${newKey.slice(0, -2)}ID`;
        }

        if (isToCamelWithSpecialID && newKey.endsWith('ID') && key.length > 2) {
          if (key.endsWith('ID')) {
            newKey = `${key.slice(0, -2)}Id`;
          }
        }

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
    if (
      key.endsWith('ID') &&
      key.length > 2 &&
      key[key.length - 3] === key[key.length - 3].toUpperCase()
    ) {
      const prefix = key.slice(0, -2);
      return `${_.camelCase(prefix)}Id`;
    }
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
    let pascalKey = _.upperFirst(_.camelCase(key));
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
};
