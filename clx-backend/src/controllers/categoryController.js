const categoryService = require('../services/categoryService');
const { sendSuccess } = require('../utils/response');

const listCategories = async (req, res) => {
  const categories = await categoryService.getActiveCategoryHierarchy();
  return sendSuccess(res, categories);
};

const getCategory = async (req, res) => {
  const category = await categoryService.getCategoryByIdentifier(req.params.categoryId);
  return sendSuccess(res, category);
};

module.exports = {
  listCategories,
  getCategory,
};
