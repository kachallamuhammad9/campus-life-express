const marketplaceService = require('../services/marketplaceService');
const { sendSuccess } = require('../utils/response');

const listListings = async (req, res) => {
  const {
    campusId,
    categoryId,
    search,
    minPrice,
    maxPrice,
    condition,
    status,
    limit,
    offset,
  } = req.query;

  const listings = await marketplaceService.listListings({
    campusId,
    categoryId,
    search,
    minPrice,
    maxPrice,
    condition,
    status,
    limit,
    offset,
  });

  return sendSuccess(res, listings);
};

const getListing = async (req, res) => {
  const listing = await marketplaceService.getListingDetails(req.params.listingId);
  return sendSuccess(res, listing);
};

const createListing = async (req, res) => {
  const listing = await marketplaceService.createListing(req.body, req.user);
  return sendSuccess(res, listing, 201);
};

const updateListing = async (req, res) => {
  const listing = await marketplaceService.updateListing(
    req.params.listingId,
    req.body,
    req.user
  );
  return sendSuccess(res, listing);
};

const deleteListing = async (req, res) => {
  const callerId = req.query?.sellerUserId || req.body?.sellerUserId;
  const result = await marketplaceService.deleteListing(
    req.params.listingId,
    req.user,
    callerId
  );
  return sendSuccess(res, result);
};

module.exports = {
  listListings,
  getListing,
  createListing,
  updateListing,
  deleteListing,
};
