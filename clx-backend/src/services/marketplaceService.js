const marketplaceRepository = require('../repositories/marketplaceRepository');
const campusRepository = require('../repositories/campusRepository');
const categoryRepository = require('../repositories/categoryRepository');
const { AppError } = require('../utils/AppError');

const VALID_CONDITIONS = new Set(['NEW', 'LIKE_NEW', 'GOOD', 'FAIR']);
const VALID_PUBLIC_STATUSES = new Set(['PUBLISHED', 'SOLD']);
const VALID_OWNER_STATUSES = new Set(['PUBLISHED', 'SOLD', 'REMOVED']);

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

const generateSlug = (title) => {
  const base = String(title || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';

  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `${base}-${randomSuffix}`;
};

const listListings = async ({
  campusId,
  categoryId,
  search,
  minPrice,
  maxPrice,
  condition,
  status,
  limit,
  offset,
} = {}) => {
  const pagination = normalizePagination(limit, offset, 20, 100);
  const parsedMinPrice = parsePrice(minPrice);
  const parsedMaxPrice = parsePrice(maxPrice);

  let filteredCondition;
  if (condition && typeof condition === 'string' && VALID_CONDITIONS.has(condition.toUpperCase())) {
    filteredCondition = condition.toUpperCase();
  }

  let filteredStatus = 'PUBLISHED';
  if (status && typeof status === 'string' && VALID_PUBLIC_STATUSES.has(status.toUpperCase())) {
    filteredStatus = status.toUpperCase();
  }

  return marketplaceRepository.listListings({
    campusId: campusId ? String(campusId).trim() : undefined,
    categoryId: categoryId ? String(categoryId).trim() : undefined,
    search: search ? String(search).trim() : undefined,
    minPrice: parsedMinPrice,
    maxPrice: parsedMaxPrice,
    condition: filteredCondition,
    status: filteredStatus,
    limit: pagination.limit,
    offset: pagination.offset,
  });
};

const formatPublicListing = (listing, images = []) => {
  return {
    id: listing.id,
    legacy_key: listing.legacy_key || null,
    slug: listing.slug,
    seller_user_id: listing.seller_user_id,
    campus_id: listing.campus_id,
    category_id: listing.category_id,
    subcategory_id: listing.subcategory_id || null,
    title: listing.title,
    description: listing.description || null,
    price_kobo: listing.price_kobo,
    original_price_kobo: listing.original_price_kobo || null,
    condition: listing.condition,
    status: listing.status,
    seller_department: listing.seller_department || null,
    seller_contact_phone: listing.seller_contact_phone || null,
    date_listed: listing.date_listed,
    date_sold: listing.date_sold || null,
    created_at: listing.created_at,
    updated_at: listing.updated_at,
    campus_name: listing.campus_name,
    campus_slug: listing.campus_slug,
    category_name: listing.category_name,
    category_slug: listing.category_slug,
    seller_name: listing.seller_name || null,
    seller_avatar_url: listing.seller_avatar_url || null,
    images: images || [],
  };
};

const getListingDetails = async (identifier) => {
  if (!identifier || typeof identifier !== 'string') {
    throw new AppError(404, 'MARKETPLACE_LISTING_NOT_FOUND', 'Marketplace listing was not found');
  }

  const listing = await marketplaceRepository.getListingByIdentifier(identifier.trim());
  if (
    !listing
    || listing.deleted_at
    || listing.campus_is_active === false
    || !VALID_PUBLIC_STATUSES.has(listing.status)
  ) {
    throw new AppError(404, 'MARKETPLACE_LISTING_NOT_FOUND', 'Marketplace listing was not found');
  }

  const images = await marketplaceRepository.getListingImages(listing.id);

  return formatPublicListing(listing, images);
};

const createListing = async (listingData = {}, userContext = null) => {
  const sellerUserId = userContext?.id
    ? userContext.id
    : (listingData.sellerUserId || listingData.seller_user_id || listingData.userId);

  if (!sellerUserId || typeof sellerUserId !== 'string' || sellerUserId.trim() === '') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required to create a marketplace listing');
  }

  const title = listingData.title;
  if (!title || typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 255) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Title is required (2-255 characters)');
  }

  const campusId = listingData.campusId || listingData.campus_id;
  if (!campusId || typeof campusId !== 'string' || campusId.trim() === '') {
    throw new AppError(400, 'VALIDATION_ERROR', 'campus_id is required');
  }

  const categoryId = listingData.categoryId || listingData.category_id;
  if (!categoryId || typeof categoryId !== 'string' || categoryId.trim() === '') {
    throw new AppError(400, 'VALIDATION_ERROR', 'category_id is required');
  }

  const subcategoryId = listingData.subcategoryId || listingData.subcategory_id || null;

  const rawPrice = listingData.priceKobo !== undefined
    ? listingData.priceKobo
    : listingData.price_kobo;

  const parsedPrice = parseInt(rawPrice, 10);
  if (!Number.isInteger(parsedPrice) || parsedPrice < 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'price_kobo must be a non-negative integer');
  }

  let parsedOriginalPrice = null;
  const rawOriginalPrice = listingData.originalPriceKobo !== undefined
    ? listingData.originalPriceKobo
    : listingData.original_price_kobo;

  if (rawOriginalPrice !== undefined && rawOriginalPrice !== null && rawOriginalPrice !== '') {
    const parsedOrig = parseInt(rawOriginalPrice, 10);
    if (!Number.isInteger(parsedOrig) || parsedOrig < parsedPrice) {
      throw new AppError(400, 'VALIDATION_ERROR', 'original_price_kobo must be greater than or equal to price_kobo');
    }
    parsedOriginalPrice = parsedOrig;
  }

  const rawCondition = listingData.condition;
  if (!rawCondition || typeof rawCondition !== 'string' || !VALID_CONDITIONS.has(rawCondition.toUpperCase())) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Valid condition is required (NEW, LIKE_NEW, GOOD, FAIR)');
  }
  const condition = rawCondition.toUpperCase();

  // Resolve campus/category by slug or id (clients may send slugs like 'unimaid')
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let resolvedCampusId = campusId.trim();
  if (!UUID_RE.test(resolvedCampusId)) {
    const campus = await campusRepository.findBySlug(resolvedCampusId.toLowerCase());
    if (!campus) throw new AppError(400, 'VALIDATION_ERROR', `Unknown campus: ${resolvedCampusId}`);
    resolvedCampusId = campus.id;
  }
  let resolvedCategoryId = categoryId.trim();
  if (!UUID_RE.test(resolvedCategoryId)) {
    const category = await categoryRepository.findBySlug(resolvedCategoryId.toLowerCase());
    if (!category) throw new AppError(400, 'VALIDATION_ERROR', `Unknown category: ${resolvedCategoryId}`);
    resolvedCategoryId = category.id;
  }

  const slug = generateSlug(title);
  const description = listingData.description ? String(listingData.description).trim() : null;
  const sellerDepartment = listingData.sellerDepartment || listingData.seller_department || null;
  const sellerContactPhone = listingData.sellerContactPhone || listingData.seller_contact_phone || null;

  // Server determines initial status ('PENDING_REVIEW') to enforce moderation safety
  const created = await marketplaceRepository.createListing({
    legacyKey: listingData.legacyKey || listingData.legacy_key || null,
    slug,
    sellerUserId: sellerUserId.trim(),
    campusId: resolvedCampusId,
    categoryId: resolvedCategoryId,
    subcategoryId: subcategoryId ? String(subcategoryId).trim() : null,
    title: title.trim(),
    description,
    priceKobo: parsedPrice,
    originalPriceKobo: parsedOriginalPrice,
    condition,
    status: 'PENDING_REVIEW',
    sellerDepartment: sellerDepartment ? String(sellerDepartment).trim() : null,
    sellerContactPhone: sellerContactPhone ? String(sellerContactPhone).trim() : null,
  });

  let images = [];
  if (Array.isArray(listingData.images) && listingData.images.length > 0) {
    images = await marketplaceRepository.createListingImages(created.id, listingData.images);
  }

  return {
    ...created,
    images,
  };
};

const updateListing = async (identifier, updateData = {}, userContext = null) => {
  const callerUserId = userContext?.id
    ? userContext.id
    : (updateData.sellerUserId || updateData.seller_user_id || updateData.userId);

  if (!callerUserId || typeof callerUserId !== 'string' || callerUserId.trim() === '') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required to update listing');
  }

  if (!identifier || typeof identifier !== 'string') {
    throw new AppError(404, 'MARKETPLACE_LISTING_NOT_FOUND', 'Marketplace listing was not found');
  }

  const existing = await marketplaceRepository.getListingByIdentifier(identifier.trim());
  if (!existing || existing.deleted_at) {
    throw new AppError(404, 'MARKETPLACE_LISTING_NOT_FOUND', 'Marketplace listing was not found');
  }

  // Ownership verification
  if (String(existing.seller_user_id) !== String(callerUserId).trim()) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to update this listing');
  }

  const updateFields = {};

  if (updateData.title !== undefined) {
    if (typeof updateData.title !== 'string' || updateData.title.trim().length < 2 || updateData.title.trim().length > 255) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Title must be between 2 and 255 characters');
    }
    updateFields.title = updateData.title.trim();
  }

  if (updateData.description !== undefined) {
    updateFields.description = updateData.description ? String(updateData.description).trim() : null;
  }

  let effectivePriceKobo = existing.price_kobo;
  const rawPrice = updateData.priceKobo !== undefined ? updateData.priceKobo : updateData.price_kobo;
  if (rawPrice !== undefined) {
    const parsed = parseInt(rawPrice, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'price_kobo must be a non-negative integer');
    }
    updateFields.price_kobo = parsed;
    effectivePriceKobo = parsed;
  }

  const rawOrigPrice = updateData.originalPriceKobo !== undefined ? updateData.originalPriceKobo : updateData.original_price_kobo;
  if (rawOrigPrice !== undefined) {
    if (rawOrigPrice === null || rawOrigPrice === '') {
      updateFields.original_price_kobo = null;
    } else {
      const parsedOrig = parseInt(rawOrigPrice, 10);
      if (!Number.isInteger(parsedOrig) || parsedOrig < effectivePriceKobo) {
        throw new AppError(400, 'VALIDATION_ERROR', 'original_price_kobo must be greater than or equal to price_kobo');
      }
      updateFields.original_price_kobo = parsedOrig;
    }
  }

  if (updateData.condition !== undefined) {
    if (typeof updateData.condition !== 'string' || !VALID_CONDITIONS.has(updateData.condition.toUpperCase())) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Valid condition is required (NEW, LIKE_NEW, GOOD, FAIR)');
    }
    updateFields.condition = updateData.condition.toUpperCase();
  }

  if (updateData.sellerDepartment !== undefined || updateData.seller_department !== undefined) {
    const val = updateData.sellerDepartment !== undefined ? updateData.sellerDepartment : updateData.seller_department;
    updateFields.seller_department = val ? String(val).trim() : null;
  }

  if (updateData.sellerContactPhone !== undefined || updateData.seller_contact_phone !== undefined) {
    const val = updateData.sellerContactPhone !== undefined ? updateData.sellerContactPhone : updateData.seller_contact_phone;
    updateFields.seller_contact_phone = val ? String(val).trim() : null;
  }

  if (updateData.status !== undefined) {
    const statusVal = String(updateData.status).toUpperCase();
    if (!VALID_OWNER_STATUSES.has(statusVal)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Status update only supports PUBLISHED, SOLD, or REMOVED');
    }
    updateFields.status = statusVal;
    if (statusVal === 'SOLD') {
      updateFields.date_sold = new Date().toISOString();
    } else {
      updateFields.date_sold = null;
    }
  }

  const updated = await marketplaceRepository.updateListing(existing.id, updateFields);
  const images = await marketplaceRepository.getListingImages(existing.id);

  return {
    ...(updated || existing),
    images: images || [],
  };
};

const deleteListing = async (identifier, userContext = null, callerId = null) => {
  const sellerUserId = userContext?.id ? userContext.id : callerId;

  if (!sellerUserId || typeof sellerUserId !== 'string' || sellerUserId.trim() === '') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required to delete listing');
  }

  if (!identifier || typeof identifier !== 'string') {
    throw new AppError(404, 'MARKETPLACE_LISTING_NOT_FOUND', 'Marketplace listing was not found');
  }

  const existing = await marketplaceRepository.getListingByIdentifier(identifier.trim());
  if (!existing || existing.deleted_at) {
    throw new AppError(404, 'MARKETPLACE_LISTING_NOT_FOUND', 'Marketplace listing was not found');
  }

  // Ownership verification
  if (String(existing.seller_user_id) !== String(sellerUserId).trim()) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to delete this listing');
  }

  await marketplaceRepository.softDeleteListing(existing.id);

  return {
    success: true,
    message: 'Marketplace listing deleted successfully',
  };
};

module.exports = {
  VALID_CONDITIONS,
  VALID_PUBLIC_STATUSES,
  VALID_OWNER_STATUSES,
  normalizePagination,
  parsePrice,
  generateSlug,
  listListings,
  getListingDetails,
  createListing,
  updateListing,
  deleteListing,
};
