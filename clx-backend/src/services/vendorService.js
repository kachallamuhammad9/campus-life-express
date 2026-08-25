const vendorRepository = require('../repositories/vendorRepository');
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

const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
};

const calculateOperatingStatus = (operatingHours, referenceDate = new Date()) => {
  if (!operatingHours || !Array.isArray(operatingHours) || operatingHours.length === 0) {
    return { is_open: null, current_day_hours: null };
  }

  // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const currentDayOfWeek = referenceDate.getDay();
  const currentHours = operatingHours.find((h) => Number(h.day_of_week) === currentDayOfWeek);

  if (!currentHours || currentHours.is_closed) {
    return { is_open: false, current_day_hours: currentHours || null };
  }

  if (!currentHours.opens_at || !currentHours.closes_at) {
    return { is_open: false, current_day_hours: currentHours };
  }

  const currentMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes();
  const opensMinutes = parseTimeToMinutes(currentHours.opens_at);
  const closesMinutes = parseTimeToMinutes(currentHours.closes_at);

  let isOpen = false;
  if (opensMinutes <= closesMinutes) {
    isOpen = currentMinutes >= opensMinutes && currentMinutes <= closesMinutes;
  } else {
    // Overnight operating window (e.g. opens 20:00, closes 02:00 next day)
    isOpen = currentMinutes >= opensMinutes || currentMinutes <= closesMinutes;
  }

  return {
    is_open: isOpen,
    current_day_hours: currentHours,
  };
};

const calculateAverageRating = (reviews) => {
  if (!reviews || !Array.isArray(reviews) || reviews.length === 0) {
    return 0;
  }
  const total = reviews.reduce((sum, review) => sum + (Number(review.rating) || 0), 0);
  return Number((total / reviews.length).toFixed(1));
};

const listVendors = async ({ campusId, categoryId, search, limit, offset } = {}) => {
  const pagination = normalizePagination(limit, offset, 20, 100);
  return vendorRepository.listVendors({
    campusId: campusId ? String(campusId).trim() : undefined,
    categoryId: categoryId ? String(categoryId).trim() : undefined,
    search: search ? String(search).trim() : undefined,
    limit: pagination.limit,
    offset: pagination.offset,
  });
};

const getVendorByIdentifier = async (identifier) => {
  const vendor = await vendorRepository.getVendorByIdentifier(identifier);
  if (!vendor) {
    throw new AppError(404, 'VENDOR_NOT_FOUND', 'Vendor was not found');
  }
  return vendor;
};

const getVendorDetails = async (identifier) => {
  const vendor = await getVendorByIdentifier(identifier);

  const [campuses, operatingHours] = await Promise.all([
    vendorRepository.getVendorCampuses(vendor.id),
    vendorRepository.getVendorOperatingHours(vendor.id),
  ]);

  const operatingStatus = calculateOperatingStatus(operatingHours);

  return {
    ...vendor,
    campuses,
    operating_hours: operatingHours,
    is_open: operatingStatus.is_open,
  };
};

const getVendorProducts = async (identifier, { limit, offset } = {}) => {
  const vendor = await getVendorByIdentifier(identifier);
  const pagination = normalizePagination(limit, offset, 50, 100);
  return vendorRepository.getVendorProducts(vendor.id, pagination);
};

const getVendorReviews = async (identifier, { limit, offset } = {}) => {
  const vendor = await getVendorByIdentifier(identifier);
  const pagination = normalizePagination(limit, offset, 50, 100);
  return vendorRepository.getVendorReviews(vendor.id, pagination);
};

module.exports = {
  normalizePagination,
  calculateOperatingStatus,
  calculateAverageRating,
  listVendors,
  getVendorByIdentifier,
  getVendorDetails,
  getVendorProducts,
  getVendorReviews,
};
