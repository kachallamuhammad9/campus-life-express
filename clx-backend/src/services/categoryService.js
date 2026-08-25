const categoryRepository = require('../repositories/categoryRepository');
const { AppError } = require('../utils/AppError');

const getActiveCategoryHierarchy = async () => {
  const [roots, categories] = await Promise.all([
    categoryRepository.getActiveRootCategories(),
    categoryRepository.getActiveCategories(),
  ]);

  const childrenByParentId = new Map();
  for (const category of categories) {
    if (category.parent_id) {
      const children = childrenByParentId.get(category.parent_id) || [];
      children.push(category);
      childrenByParentId.set(category.parent_id, children);
    }
  }

  return roots.map((root) => ({
    ...root,
    subcategories: childrenByParentId.get(root.id) || [],
  }));
};

const getCategoryByIdentifier = async (identifier) => {
  const category = await categoryRepository.getCategoryByIdentifier(identifier);
  if (!category) {
    throw new AppError(
      404,
      'CATEGORY_NOT_FOUND',
      'The requested category was not found'
    );
  }

  return category;
};

module.exports = {
  getActiveCategoryHierarchy,
  getCategoryByIdentifier,
};
