const productRepository = require('../repositories/productRepository');
const { AppError } = require('../utils/AppError');

const normalizePagination = (queryLimit, queryOffset, defaultLimit = 20, maxLimit = 100) => {
  const parsedLimit = parseInt(queryLimit, 10);
  const parsedOffset = parseInt(queryOffset, 10);

  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, maxLimit)
    : defaultLimit;

  const offset = Number.isInteger(parsedOffset) && parsedOffset >= 0
    ? parsedOffset
    : 0;

  return { limit, offset };
};

const parsePrice = (value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
};

const parseBooleanFilter = (value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (value === true || value === 'true' || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === '0') {
    return false;
  }
  return undefined;
};

const calculateAverageRating = (reviews) => {
  if (!reviews || !Array.isArray(reviews) || reviews.length === 0) {
    return 0;
  }
  const total = reviews.reduce((sum, review) => sum + (Number(review.rating) || 0), 0);
  return Number((total / reviews.length).toFixed(1));
};

const listProducts = async ({
  campusId,
  vendorId,
  categoryId,
  search,
  minPrice,
  maxPrice,
  inStock,
  limit,
  offset,
} = {}) => {
  const pagination = normalizePagination(limit, offset, 20, 100);
  const parsedMinPrice = parsePrice(minPrice);
  const parsedMaxPrice = parsePrice(maxPrice);
  const parsedInStock = parseBooleanFilter(inStock);

  return productRepository.listProducts({
    campusId: campusId ? String(campusId).trim() : undefined,
    vendorId: vendorId ? String(vendorId).trim() : undefined,
    categoryId: categoryId ? String(categoryId).trim() : undefined,
    search: search ? String(search).trim() : undefined,
    minPrice: parsedMinPrice,
    maxPrice: parsedMaxPrice,
    inStock: parsedInStock,
    limit: pagination.limit,
    offset: pagination.offset,
  });
};

const getProductByIdentifier = async (identifier) => {
  const product = await productRepository.getProductByIdentifier(identifier);
  if (!product) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product was not found');
  }
  return product;
};

const getProductDetails = async (identifier) => {
  const product = await getProductByIdentifier(identifier);
  const images = await productRepository.getProductImages(product.id);

  return {
    ...product,
    images: images || [],
  };
};

const getProductReviews = async (identifier, { limit, offset } = {}) => {
  const product = await getProductByIdentifier(identifier);
  const pagination = normalizePagination(limit, offset, 50, 100);
  return productRepository.getProductReviews(product.id, pagination);
};

module.exports = {
  normalizePagination,
  parsePrice,
  parseBooleanFilter,
  calculateAverageRating,
  listProducts,
  getProductByIdentifier,
  getProductDetails,
  getProductReviews,
};
