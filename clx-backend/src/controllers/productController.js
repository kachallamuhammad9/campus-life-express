const productService = require('../services/productService');
const { sendSuccess } = require('../utils/response');

const listProducts = async (req, res) => {
  const {
    campusId,
    vendorId,
    categoryId,
    search,
    minPrice,
    maxPrice,
    inStock,
    limit,
    offset,
  } = req.query;

  const products = await productService.listProducts({
    campusId,
    vendorId,
    categoryId,
    search,
    minPrice,
    maxPrice,
    inStock,
    limit,
    offset,
  });

  return sendSuccess(res, products);
};

const getProduct = async (req, res) => {
  const product = await productService.getProductDetails(req.params.productId);
  return sendSuccess(res, product);
};

const listProductReviews = async (req, res) => {
  const { limit, offset } = req.query;
  const reviews = await productService.getProductReviews(req.params.productId, {
    limit,
    offset,
  });
  return sendSuccess(res, reviews);
};

module.exports = {
  listProducts,
  getProduct,
  listProductReviews,
};
