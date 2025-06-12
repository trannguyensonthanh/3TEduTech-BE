// File: categories.validation.js
/**
 * Validation for creating a category
 */
const Joi = require('joi');

const createCategory = {
  body: Joi.object().keys({
    categoryName: Joi.string().required().max(150),
    slug: Joi.string()
      .max(150)
      .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional()
      .allow(null, '')
      .messages({
        'string.pattern.base':
          'Slug chỉ được chứa chữ thường, số và dấu gạch ngang',
      }),
    description: Joi.string().max(500).allow(null, ''),
    iconUrl: Joi.string()
      .uri({ allowRelative: false })
      .max(500)
      .allow(null, ''),
  }),
};

/**
 * Validation for getting categories (list)
 */
const getCategories = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(0),
    searchTerm: Joi.string().allow(null, ''),
  }),
};

/**
 * Validation for getting a category by ID
 */
const getCategory = {
  params: Joi.object().keys({
    categoryId: Joi.number().integer().required(),
  }),
};

/**
 * Validation for getting a category by slug
 */
const getCategoryBySlug = {
  params: Joi.object().keys({
    categorySlug: Joi.string().required(),
  }),
};

/**
 * Validation for updating a category
 */
const updateCategory = {
  params: Joi.object().keys({
    categoryId: Joi.number().integer().required(),
  }),
  body: Joi.object()
    .keys({
      categoryName: Joi.string().max(150),
      slug: Joi.string()
        .max(150)
        .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .allow(null, '')
        .messages({
          'string.pattern.base':
            'Slug chỉ được chứa chữ thường, số và dấu gạch ngang',
        }),
      description: Joi.string().max(500).allow(null, ''),
      iconUrl: Joi.string()
        .uri({ allowRelative: false })
        .max(500)
        .allow(null, ''),
    })
    .min(1),
};

/**
 * Validation for deleting a category
 */
const deleteCategory = {
  params: Joi.object().keys({
    categoryId: Joi.number().integer().required(),
  }),
};

module.exports = {
  createCategory,
  getCategories,
  getCategory,
  updateCategory,
  deleteCategory,
  getCategoryBySlug,
};
