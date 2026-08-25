const vendorService = require('../services/vendorService');
const { sendSuccess } = require('../utils/response');

const listVendors = async (req, res) => {
  const { campusId, categoryId, search, limit, offset } = req.query;
  const vendors = await vendorService.listVendors({
    campusId,
    categoryId,
    search,
    limit,
    offset,
  });
  return sendSuccess(res, vendors);
};

const getVendor = async (req, res) => {
  const vendor = await vendorService.getVendorDetails(req.params.vendorId);
  return sendSuccess(res, vendor);
};

const listVendorProducts = async (req, res) => {
  const { limit, offset } = req.query;
  const products = await vendorService.getVendorProducts(req.params.vendorId, {
    limit,
    offset,
  });
  return sendSuccess(res, products);
};

const listVendorReviews = async (req, res) => {
  const { limit, offset } = req.query;
  const reviews = await vendorService.getVendorReviews(req.params.vendorId, {
    limit,
    offset,
  });
  return sendSuccess(res, reviews);
};

module.exports = {
  listVendors,
  getVendor,
  listVendorProducts,
  listVendorReviews,
};
