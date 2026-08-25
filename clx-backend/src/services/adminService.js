/**
 * Admin Service
 * Business logic layer for administrative management, entity moderation,
 * user role governance, analytics, and audit logging.
 */

const adminRepository = require('../repositories/adminRepository');
const auditRepository = require('../repositories/auditRepository');
const notificationService = require('./notificationService');
const { AppError } = require('../utils/AppError');

const VALID_VENDOR_STATUSES = new Set(['PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED']);
const VALID_LISTING_STATUSES = new Set(['PENDING_REVIEW', 'PUBLISHED', 'SOLD', 'REMOVED', 'REJECTED']);
const VALID_ORDER_STATUSES = new Set(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']);
const VALID_DELIVERY_STATUSES = new Set(['REQUESTED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']);
const VALID_APP_ROLES = new Set(['CUSTOMER', 'VENDOR', 'RIDER', 'ADMIN', 'SUPER_ADMIN']);

/**
 * Normalizes pagination parameters
 */
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

/**
 * Helper to check if a user is a SUPER_ADMIN
 */
const isSuperAdmin = (user) => {
  if (!user) return false;
  const userRole = (user.role || '').toUpperCase();
  const userRoles = (user.roles || []).map((r) => String(r).toUpperCase());
  return userRole === 'SUPER_ADMIN' || userRoles.includes('SUPER_ADMIN');
};

/**
 * Helper to log audit event safely without breaking operations
 */
const logAuditEventSafe = async (adminUser, reqContext, action, resourceType, resourceId, changes = null) => {
  try {
    await auditRepository.createAuditLog({
      actorUserId: adminUser?.id || null,
      action,
      resourceType,
      resourceId: resourceId || null,
      changes,
      ipAddress: reqContext?.ip || null,
      userAgent: reqContext?.userAgent || null,
    });
  } catch (err) {
    console.warn('[AdminService:AuditLog] Failed to record audit log:', err.message);
  }
};

// ==========================================
// 1. DASHBOARD & STATS
// ==========================================

const getDashboardSummary = async ({ campusId } = {}, adminUser) => {
  const stats = await adminRepository.getDashboardStats({ campusId });
  return stats;
};

// ==========================================
// 2. VENDOR MANAGEMENT & MODERATION
// ==========================================

const listVendors = async (query = {}, adminUser) => {
  const { limit, offset } = normalizePagination(query.limit, query.offset);

  let filteredStatus;
  if (query.status) {
    const s = String(query.status).toUpperCase().trim();
    if (VALID_VENDOR_STATUSES.has(s)) {
      filteredStatus = s;
    } else {
      throw new AppError(400, 'INVALID_STATUS', `Status must be one of: ${Array.from(VALID_VENDOR_STATUSES).join(', ')}`);
    }
  }

  const [vendors, totalCount] = await Promise.all([
    adminRepository.listAdminVendors({
      status: filteredStatus,
      campusId: query.campusId,
      categoryId: query.categoryId,
      search: query.search,
      isVerified: query.isVerified,
      limit,
      offset,
    }),
    adminRepository.countAdminVendors({
      status: filteredStatus,
      campusId: query.campusId,
      categoryId: query.categoryId,
      search: query.search,
      isVerified: query.isVerified,
    }),
  ]);

  return {
    vendors,
    pagination: {
      total: totalCount,
      limit,
      offset,
      count: vendors.length,
    },
  };
};

const getVendorDetails = async (vendorId, adminUser) => {
  if (!vendorId || typeof vendorId !== 'string') {
    throw new AppError(400, 'INVALID_ID', 'Vendor ID is required');
  }

  const vendor = await adminRepository.getAdminVendorById(vendorId.trim());
  if (!vendor) {
    throw new AppError(404, 'VENDOR_NOT_FOUND', 'Vendor was not found');
  }

  return vendor;
};

const moderateVendor = async (vendorId, updateData = {}, adminUser, reqContext = {}) => {
  if (!vendorId || typeof vendorId !== 'string') {
    throw new AppError(400, 'INVALID_ID', 'Vendor ID is required');
  }

  const existing = await adminRepository.getAdminVendorById(vendorId.trim());
  if (!existing) {
    throw new AppError(404, 'VENDOR_NOT_FOUND', 'Vendor was not found');
  }

  const fieldsToUpdate = {};

  if (updateData.status !== undefined) {
    const s = String(updateData.status).toUpperCase().trim();
    if (!VALID_VENDOR_STATUSES.has(s)) {
      throw new AppError(400, 'INVALID_STATUS', `Status must be one of: ${Array.from(VALID_VENDOR_STATUSES).join(', ')}`);
    }
    fieldsToUpdate.status = s;
  }

  if (updateData.isVerified !== undefined || updateData.is_verified !== undefined) {
    const v = updateData.isVerified !== undefined ? updateData.isVerified : updateData.is_verified;
    fieldsToUpdate.is_verified = Boolean(v);
  }

  if (updateData.name !== undefined) {
    if (typeof updateData.name !== 'string' || updateData.name.trim().length < 2) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Vendor name must be at least 2 characters');
    }
    fieldsToUpdate.name = updateData.name.trim();
  }

  if (updateData.description !== undefined) {
    fieldsToUpdate.description = updateData.description ? String(updateData.description).trim() : null;
  }

  if (updateData.phoneNumber !== undefined || updateData.phone_number !== undefined) {
    const p = updateData.phoneNumber !== undefined ? updateData.phoneNumber : updateData.phone_number;
    fieldsToUpdate.phone_number = p ? String(p).trim() : null;
  }

  if (updateData.email !== undefined) {
    fieldsToUpdate.email = updateData.email ? String(updateData.email).trim() : null;
  }

  if (updateData.location !== undefined) {
    fieldsToUpdate.location = updateData.location ? String(updateData.location).trim() : null;
  }

  const updated = await adminRepository.updateAdminVendor(existing.id, fieldsToUpdate);

  // Record audit log
  await logAuditEventSafe(
    adminUser,
    reqContext,
    'MODERATE_VENDOR',
    'VENDOR',
    existing.id,
    {
      previous: { status: existing.status, is_verified: existing.is_verified, name: existing.name },
      updated: fieldsToUpdate,
      notes: updateData.notes || null,
    }
  );

  // Notify vendor owner safely if status changed
  if (fieldsToUpdate.status && fieldsToUpdate.status !== existing.status && existing.owner_user_id) {
    await notificationService.notifySystemAlert(
      existing.owner_user_id,
      'Vendor Status Update',
      `Your vendor account "${existing.name}" status has been changed to ${fieldsToUpdate.status}.`,
      { email: existing.email || existing.owner_email }
    );
  }

  return updated;
};

// ==========================================
// 3. PRODUCT / CATALOG MODERATION
// ==========================================

const listProducts = async (query = {}, adminUser) => {
  const { limit, offset } = normalizePagination(query.limit, query.offset);

  const [products, totalCount] = await Promise.all([
    adminRepository.listAdminProducts({
      search: query.search,
      vendorId: query.vendorId,
      campusId: query.campusId,
      categoryId: query.categoryId,
      isInStock: query.isInStock,
      limit,
      offset,
    }),
    adminRepository.countAdminProducts({
      search: query.search,
      vendorId: query.vendorId,
      campusId: query.campusId,
      categoryId: query.categoryId,
      isInStock: query.isInStock,
    }),
  ]);

  return {
    products,
    pagination: {
      total: totalCount,
      limit,
      offset,
      count: products.length,
    },
  };
};

const getProductDetails = async (productId, adminUser) => {
  if (!productId || typeof productId !== 'string') {
    throw new AppError(400, 'INVALID_ID', 'Product ID is required');
  }

  const product = await adminRepository.getAdminProductById(productId.trim());
  if (!product) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product was not found');
  }

  return product;
};

const updateProduct = async (productId, updateData = {}, adminUser, reqContext = {}) => {
  if (!productId || typeof productId !== 'string') {
    throw new AppError(400, 'INVALID_ID', 'Product ID is required');
  }

  const existing = await adminRepository.getAdminProductById(productId.trim());
  if (!existing) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product was not found');
  }

  const fieldsToUpdate = {};

  if (updateData.isInStock !== undefined || updateData.is_in_stock !== undefined) {
    const v = updateData.isInStock !== undefined ? updateData.isInStock : updateData.is_in_stock;
    fieldsToUpdate.is_in_stock = Boolean(v);
  }

  if (updateData.stockQuantity !== undefined || updateData.stock_quantity !== undefined) {
    const q = updateData.stockQuantity !== undefined ? updateData.stockQuantity : updateData.stock_quantity;
    if (q === null || q === '') {
      fieldsToUpdate.stock_quantity = null;
    } else {
      const parsed = parseInt(q, 10);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new AppError(400, 'VALIDATION_ERROR', 'stock_quantity must be a non-negative integer');
      }
      fieldsToUpdate.stock_quantity = parsed;
    }
  }

  if (updateData.priceKobo !== undefined || updateData.price_kobo !== undefined) {
    const p = updateData.priceKobo !== undefined ? updateData.priceKobo : updateData.price_kobo;
    const parsed = parseInt(p, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'price_kobo must be a non-negative integer');
    }
    fieldsToUpdate.price_kobo = parsed;
  }

  if (updateData.originalPriceKobo !== undefined || updateData.original_price_kobo !== undefined) {
    const op = updateData.originalPriceKobo !== undefined ? updateData.originalPriceKobo : updateData.original_price_kobo;
    if (op === null || op === '') {
      fieldsToUpdate.original_price_kobo = null;
    } else {
      const parsed = parseInt(op, 10);
      const effectivePrice = fieldsToUpdate.price_kobo !== undefined ? fieldsToUpdate.price_kobo : existing.price_kobo;
      if (!Number.isInteger(parsed) || parsed < effectivePrice) {
        throw new AppError(400, 'VALIDATION_ERROR', 'original_price_kobo must be >= price_kobo');
      }
      fieldsToUpdate.original_price_kobo = parsed;
    }
  }

  if (updateData.isPopular !== undefined || updateData.is_popular !== undefined) {
    const pop = updateData.isPopular !== undefined ? updateData.isPopular : updateData.is_popular;
    fieldsToUpdate.is_popular = Boolean(pop);
  }

  if (updateData.name !== undefined) {
    if (typeof updateData.name !== 'string' || updateData.name.trim().length < 2) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Product name must be at least 2 characters');
    }
    fieldsToUpdate.name = updateData.name.trim();
  }

  if (updateData.description !== undefined) {
    fieldsToUpdate.description = updateData.description ? String(updateData.description).trim() : null;
  }

  const updated = await adminRepository.updateAdminProduct(existing.id, fieldsToUpdate);

  await logAuditEventSafe(
    adminUser,
    reqContext,
    'UPDATE_PRODUCT',
    'PRODUCT',
    existing.id,
    {
      previous: { is_in_stock: existing.is_in_stock, price_kobo: existing.price_kobo, name: existing.name },
      updated: fieldsToUpdate,
    }
  );

  return updated;
};

const deleteProduct = async (productId, adminUser, reqContext = {}) => {
  if (!productId || typeof productId !== 'string') {
    throw new AppError(400, 'INVALID_ID', 'Product ID is required');
  }

  const existing = await adminRepository.getAdminProductById(productId.trim());
  if (!existing) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product was not found');
  }

  const deleted = await adminRepository.deleteAdminProduct(existing.id);

  await logAuditEventSafe(
    adminUser,
    reqContext,
    'DELETE_PRODUCT',
    'PRODUCT',
    existing.id,
    { deletedProduct: existing }
  );

  return {
    success: true,
    message: 'Product removed successfully',
    deleted,
  };
};

// ==========================================
// 4. STUDENT MARKETPLACE MODERATION
// ==========================================

const listMarketplaceListings = async (query = {}, adminUser) => {
  const { limit, offset } = normalizePagination(query.limit, query.offset);

  let filteredStatus;
  if (query.status) {
    const s = String(query.status).toUpperCase().trim();
    if (VALID_LISTING_STATUSES.has(s)) {
      filteredStatus = s;
    } else {
      throw new AppError(400, 'INVALID_STATUS', `Status must be one of: ${Array.from(VALID_LISTING_STATUSES).join(', ')}`);
    }
  }

  const [listings, totalCount] = await Promise.all([
    adminRepository.listAdminMarketplaceListings({
      status: filteredStatus,
      campusId: query.campusId,
      categoryId: query.categoryId,
      condition: query.condition,
      search: query.search,
      sellerUserId: query.sellerUserId,
      limit,
      offset,
    }),
    adminRepository.countAdminMarketplaceListings({
      status: filteredStatus,
      campusId: query.campusId,
      categoryId: query.categoryId,
      condition: query.condition,
      search: query.search,
      sellerUserId: query.sellerUserId,
    }),
  ]);

  return {
    listings,
    pagination: {
      total: totalCount,
      limit,
      offset,
      count: listings.length,
    },
  };
};

const getMarketplaceListingDetails = async (listingId, adminUser) => {
  if (!listingId || typeof listingId !== 'string') {
    throw new AppError(400, 'INVALID_ID', 'Listing ID is required');
  }

  const listing = await adminRepository.getAdminMarketplaceListingById(listingId.trim());
  if (!listing) {
    throw new AppError(404, 'MARKETPLACE_LISTING_NOT_FOUND', 'Marketplace listing was not found');
  }

  return listing;
};

const moderateMarketplaceListing = async (listingId, moderationData = {}, adminUser, reqContext = {}) => {
  if (!listingId || typeof listingId !== 'string') {
    throw new AppError(400, 'INVALID_ID', 'Listing ID is required');
  }

  const existing = await adminRepository.getAdminMarketplaceListingById(listingId.trim());
  if (!existing) {
    throw new AppError(404, 'MARKETPLACE_LISTING_NOT_FOUND', 'Marketplace listing was not found');
  }

  const rawAction = moderationData.action || moderationData.status;
  if (!rawAction || typeof rawAction !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Action or status is required (e.g. APPROVE, REJECT, PUBLISHED, REJECTED, REMOVED)');
  }

  let newStatus;
  const upperAction = rawAction.toUpperCase().trim();

  if (upperAction === 'APPROVE' || upperAction === 'PUBLISHED') {
    newStatus = 'PUBLISHED';
  } else if (upperAction === 'REJECT' || upperAction === 'REJECTED') {
    newStatus = 'REJECTED';
  } else if (upperAction === 'REMOVE' || upperAction === 'REMOVED' || upperAction === 'SUSPEND') {
    newStatus = 'REMOVED';
  } else if (upperAction === 'PENDING_REVIEW' || upperAction === 'SOLD') {
    newStatus = upperAction;
  } else {
    throw new AppError(400, 'INVALID_STATUS', `Action/Status must be one of: APPROVE, REJECT, REMOVED, PUBLISHED, REJECTED, PENDING_REVIEW`);
  }

  const rejectionReason = moderationData.rejectionReason || moderationData.rejection_reason || null;
  if (newStatus === 'REJECTED' && (!rejectionReason || !String(rejectionReason).trim())) {
    throw new AppError(400, 'VALIDATION_ERROR', 'A rejection reason is required when rejecting a listing');
  }

  const updated = await adminRepository.moderateMarketplaceListing(existing.id, {
    status: newStatus,
    rejectionReason: newStatus === 'REJECTED' ? String(rejectionReason).trim() : null,
    moderatedBy: adminUser.id,
  });

  // Record audit log
  await logAuditEventSafe(
    adminUser,
    reqContext,
    'MODERATE_MARKETPLACE_LISTING',
    'MARKETPLACE_LISTING',
    existing.id,
    {
      previousStatus: existing.status,
      newStatus,
      rejectionReason: newStatus === 'REJECTED' ? rejectionReason : null,
    }
  );

  // Notify seller safely
  const actionLabel = newStatus === 'PUBLISHED' ? 'APPROVE' : (newStatus === 'REJECTED' ? 'REJECT' : newStatus);
  await notificationService.notifyMarketplaceListingModerated(
    existing,
    actionLabel,
    rejectionReason,
    { sellerEmail: existing.seller_email }
  );

  return updated;
};

// ==========================================
// 5. SERVICES MODERATION & MANAGEMENT
// ==========================================

const listServices = async (query = {}, adminUser) => {
  const { limit, offset } = normalizePagination(query.limit, query.offset);

  const [services, totalCount] = await Promise.all([
    adminRepository.listAdminServices({
      campusId: query.campusId,
      categoryId: query.categoryId,
      search: query.search,
      isActive: query.isActive,
      providerUserId: query.providerUserId,
      vendorId: query.vendorId,
      limit,
      offset,
    }),
    adminRepository.countAdminServices({
      campusId: query.campusId,
      categoryId: query.categoryId,
      search: query.search,
      isActive: query.isActive,
      providerUserId: query.providerUserId,
      vendorId: query.vendorId,
    }),
  ]);

  return {
    services,
    pagination: {
      total: totalCount,
      limit,
      offset,
      count: services.length,
    },
  };
};

const getServiceDetails = async (serviceId, adminUser) => {
  if (!serviceId || typeof serviceId !== 'string') {
    throw new AppError(400, 'INVALID_ID', 'Service ID is required');
  }

  const service = await adminRepository.getAdminServiceById(serviceId.trim());
  if (!service) {
    throw new AppError(404, 'SERVICE_NOT_FOUND', 'Service was not found');
  }

  return service;
};

const updateService = async (serviceId, updateData = {}, adminUser, reqContext = {}) => {
  if (!serviceId || typeof serviceId !== 'string') {
    throw new AppError(400, 'INVALID_ID', 'Service ID is required');
  }

  const existing = await adminRepository.getAdminServiceById(serviceId.trim());
  if (!existing) {
    throw new AppError(404, 'SERVICE_NOT_FOUND', 'Service was not found');
  }

  const fieldsToUpdate = {};

  if (updateData.isActive !== undefined || updateData.is_active !== undefined) {
    const a = updateData.isActive !== undefined ? updateData.isActive : updateData.is_active;
    fieldsToUpdate.is_active = Boolean(a);
  }

  if (updateData.name !== undefined) {
    if (typeof updateData.name !== 'string' || updateData.name.trim().length < 2) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Service name must be at least 2 characters');
    }
    fieldsToUpdate.name = updateData.name.trim();
  }

  if (updateData.description !== undefined) {
    fieldsToUpdate.description = updateData.description ? String(updateData.description).trim() : null;
  }

  if (updateData.startingPriceKobo !== undefined || updateData.starting_price_kobo !== undefined) {
    const p = updateData.startingPriceKobo !== undefined ? updateData.startingPriceKobo : updateData.starting_price_kobo;
    if (p === null || p === '') {
      fieldsToUpdate.starting_price_kobo = null;
    } else {
      const parsed = parseInt(p, 10);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new AppError(400, 'VALIDATION_ERROR', 'starting_price_kobo must be a non-negative integer');
      }
      fieldsToUpdate.starting_price_kobo = parsed;
    }
  }

  if (updateData.priceType !== undefined || updateData.price_type !== undefined) {
    const pt = String(updateData.priceType || updateData.price_type).toUpperCase();
    if (!['FIXED', 'STARTING_FROM', 'QUOTE'].includes(pt)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'price_type must be FIXED, STARTING_FROM, or QUOTE');
    }
    fieldsToUpdate.price_type = pt;
  }

  if (updateData.turnaroundTime !== undefined || updateData.turnaround_time !== undefined) {
    const tt = updateData.turnaroundTime !== undefined ? updateData.turnaroundTime : updateData.turnaround_time;
    fieldsToUpdate.turnaround_time = tt ? String(tt).trim() : null;
  }

  const updated = await adminRepository.updateAdminService(existing.id, fieldsToUpdate);

  await logAuditEventSafe(
    adminUser,
    reqContext,
    'UPDATE_SERVICE',
    'SERVICE',
    existing.id,
    {
      previous: { is_active: existing.is_active, name: existing.name },
      updated: fieldsToUpdate,
    }
  );

  return updated;
};

// ==========================================
// 6. ORDER INSPECTION & MANAGEMENT
// ==========================================

const listOrders = async (query = {}, adminUser) => {
  const { limit, offset } = normalizePagination(query.limit, query.offset);

  let filteredStatus;
  if (query.status) {
    const s = String(query.status).toUpperCase().trim();
    if (VALID_ORDER_STATUSES.has(s)) {
      filteredStatus = s;
    } else {
      throw new AppError(400, 'INVALID_STATUS', `Order status must be one of: ${Array.from(VALID_ORDER_STATUSES).join(', ')}`);
    }
  }

  const [orders, totalCount] = await Promise.all([
    adminRepository.listAdminOrders({
      status: filteredStatus,
      orderType: query.orderType,
      campusId: query.campusId,
      vendorId: query.vendorId,
      customerUserId: query.customerUserId,
      startDate: query.startDate,
      endDate: query.endDate,
      search: query.search,
      limit,
      offset,
    }),
    adminRepository.countAdminOrders({
      status: filteredStatus,
      orderType: query.orderType,
      campusId: query.campusId,
      vendorId: query.vendorId,
      customerUserId: query.customerUserId,
      startDate: query.startDate,
      endDate: query.endDate,
      search: query.search,
    }),
  ]);

  return {
    orders,
    pagination: {
      total: totalCount,
      limit,
      offset,
      count: orders.length,
    },
  };
};

const getOrderDetails = async (orderId, adminUser) => {
  if (!orderId || typeof orderId !== 'string') {
    throw new AppError(400, 'INVALID_ID', 'Order ID is required');
  }

  const order = await adminRepository.getAdminOrderById(orderId.trim());
  if (!order) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found');
  }

  return order;
};

const updateOrderStatus = async (orderId, { status, cancelReason }, adminUser, reqContext = {}) => {
  if (!orderId || typeof orderId !== 'string') {
    throw new AppError(400, 'INVALID_ID', 'Order ID is required');
  }

  const existing = await adminRepository.getAdminOrderById(orderId.trim());
  if (!existing) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found');
  }

  const upperStatus = String(status || '').toUpperCase().trim();
  if (!VALID_ORDER_STATUSES.has(upperStatus)) {
    throw new AppError(400, 'INVALID_STATUS', `Status must be one of: ${Array.from(VALID_ORDER_STATUSES).join(', ')}`);
  }

  const updated = await adminRepository.updateAdminOrderStatus(existing.id, {
    status: upperStatus,
    cancelReason,
  });

  // Record audit log
  await logAuditEventSafe(
    adminUser,
    reqContext,
    'UPDATE_ORDER_STATUS',
    'ORDER',
    existing.id,
    {
      previousStatus: existing.status,
      newStatus: upperStatus,
      cancelReason: cancelReason || null,
    }
  );

  // Notify customer safely
  await notificationService.notifyOrderStatusChanged(
    existing,
    existing.status,
    upperStatus,
    { customerEmail: existing.customer_email }
  );

  return updated;
};

// ==========================================
// 7. DELIVERY INSPECTION & MANAGEMENT
// ==========================================

const listDeliveries = async (query = {}, adminUser) => {
  const { limit, offset } = normalizePagination(query.limit, query.offset);

  let filteredStatus;
  if (query.status) {
    const s = String(query.status).toUpperCase().trim();
    if (VALID_DELIVERY_STATUSES.has(s)) {
      filteredStatus = s;
    } else {
      throw new AppError(400, 'INVALID_STATUS', `Delivery status must be one of: ${Array.from(VALID_DELIVERY_STATUSES).join(', ')}`);
    }
  }

  const [deliveries, totalCount] = await Promise.all([
    adminRepository.listAdminDeliveries({
      status: filteredStatus,
      taskType: query.taskType,
      campusId: query.campusId,
      requesterUserId: query.requesterUserId,
      riderUserId: query.riderUserId,
      limit,
      offset,
    }),
    adminRepository.countAdminDeliveries({
      status: filteredStatus,
      taskType: query.taskType,
      campusId: query.campusId,
      requesterUserId: query.requesterUserId,
      riderUserId: query.riderUserId,
    }),
  ]);

  return {
    deliveries,
    pagination: {
      total: totalCount,
      limit,
      offset,
      count: deliveries.length,
    },
  };
};

const getDeliveryDetails = async (deliveryId, adminUser) => {
  if (!deliveryId || typeof deliveryId !== 'string') {
    throw new AppError(400, 'INVALID_ID', 'Delivery ID is required');
  }

  const delivery = await adminRepository.getAdminDeliveryById(deliveryId.trim());
  if (!delivery) {
    throw new AppError(404, 'DELIVERY_NOT_FOUND', 'Delivery request was not found');
  }

  return delivery;
};

const updateDeliveryStatus = async (deliveryId, { status, riderUserId }, adminUser, reqContext = {}) => {
  if (!deliveryId || typeof deliveryId !== 'string') {
    throw new AppError(400, 'INVALID_ID', 'Delivery ID is required');
  }

  const existing = await adminRepository.getAdminDeliveryById(deliveryId.trim());
  if (!existing) {
    throw new AppError(404, 'DELIVERY_NOT_FOUND', 'Delivery request was not found');
  }

  const upperStatus = String(status || '').toUpperCase().trim();
  if (!VALID_DELIVERY_STATUSES.has(upperStatus)) {
    throw new AppError(400, 'INVALID_STATUS', `Delivery status must be one of: ${Array.from(VALID_DELIVERY_STATUSES).join(', ')}`);
  }

  const updated = await adminRepository.updateAdminDeliveryStatus(existing.id, {
    status: upperStatus,
    riderUserId,
  });

  await logAuditEventSafe(
    adminUser,
    reqContext,
    'UPDATE_DELIVERY_STATUS',
    'DELIVERY_REQUEST',
    existing.id,
    {
      previousStatus: existing.status,
      newStatus: upperStatus,
      riderUserId: riderUserId || existing.rider_user_id,
    }
  );

  // Notify requester safely
  await notificationService.notifyDeliveryStatusChanged(
    { ...existing, status: upperStatus, rider_user_id: riderUserId || existing.rider_user_id },
    { requesterEmail: existing.requester_email }
  );

  return updated;
};

// ==========================================
// 8. USER & ROLE MANAGEMENT
// ==========================================

const listUsers = async (query = {}, adminUser) => {
  const { limit, offset } = normalizePagination(query.limit, query.offset);

  let filteredRole;
  if (query.role) {
    const r = String(query.role).toUpperCase().trim();
    if (VALID_APP_ROLES.has(r)) {
      filteredRole = r;
    } else {
      throw new AppError(400, 'INVALID_ROLE', `Role must be one of: ${Array.from(VALID_APP_ROLES).join(', ')}`);
    }
  }

  const [users, totalCount] = await Promise.all([
    adminRepository.listAdminUsers({
      role: filteredRole,
      campusId: query.campusId,
      search: query.search,
      isActive: query.isActive,
      limit,
      offset,
    }),
    adminRepository.countAdminUsers({
      role: filteredRole,
      campusId: query.campusId,
      search: query.search,
      isActive: query.isActive,
    }),
  ]);

  return {
    users,
    pagination: {
      total: totalCount,
      limit,
      offset,
      count: users.length,
    },
  };
};

const getUserDetails = async (userId, adminUser) => {
  if (!userId || typeof userId !== 'string') {
    throw new AppError(400, 'INVALID_ID', 'User ID is required');
  }

  const user = await adminRepository.getAdminUserById(userId.trim());
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User profile was not found');
  }

  return user;
};

const updateUserStatus = async (userId, { isActive }, adminUser, reqContext = {}) => {
  if (!userId || typeof userId !== 'string') {
    throw new AppError(400, 'INVALID_ID', 'User ID is required');
  }

  if (isActive === undefined || isActive === null) {
    throw new AppError(400, 'VALIDATION_ERROR', 'isActive (boolean) is required');
  }

  const targetUser = await adminRepository.getAdminUserById(userId.trim());
  if (!targetUser) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User profile was not found');
  }

  // Prevent regular admin from deactivating a SUPER_ADMIN
  if (!isSuperAdmin(adminUser) && targetUser.roles.includes('SUPER_ADMIN')) {
    throw new AppError(403, 'FORBIDDEN', 'Cannot modify the active status of a Super Administrator');
  }

  const updated = await adminRepository.updateAdminUserStatus(targetUser.id, {
    isActive: Boolean(isActive),
  });

  await logAuditEventSafe(
    adminUser,
    reqContext,
    'UPDATE_USER_STATUS',
    'USER',
    targetUser.id,
    {
      previousStatus: targetUser.is_active,
      newStatus: Boolean(isActive),
    }
  );

  return updated;
};

/**
 * Super Admin Role Management Operations
 */

const assignRole = async (userId, role, adminUser, reqContext = {}) => {
  if (!isSuperAdmin(adminUser)) {
    throw new AppError(403, 'FORBIDDEN', 'Only Super Administrators can assign user roles');
  }

  if (!userId || typeof userId !== 'string') {
    throw new AppError(400, 'INVALID_ID', 'User ID is required');
  }

  const upperRole = String(role || '').toUpperCase().trim();
  if (!VALID_APP_ROLES.has(upperRole)) {
    throw new AppError(400, 'INVALID_ROLE', `Role must be one of: ${Array.from(VALID_APP_ROLES).join(', ')}`);
  }

  const targetUser = await adminRepository.getAdminUserById(userId.trim());
  if (!targetUser) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User profile was not found');
  }

  const updatedRoles = await adminRepository.assignUserRole(targetUser.id, upperRole);

  await logAuditEventSafe(
    adminUser,
    reqContext,
    'ASSIGN_USER_ROLE',
    'USER_ROLE',
    targetUser.id,
    {
      assignedRole: upperRole,
      currentRoles: updatedRoles,
    }
  );

  return {
    userId: targetUser.id,
    roles: updatedRoles,
  };
};

const removeRole = async (userId, role, adminUser, reqContext = {}) => {
  if (!isSuperAdmin(adminUser)) {
    throw new AppError(403, 'FORBIDDEN', 'Only Super Administrators can remove user roles');
  }

  if (!userId || typeof userId !== 'string') {
    throw new AppError(400, 'INVALID_ID', 'User ID is required');
  }

  const upperRole = String(role || '').toUpperCase().trim();
  if (!VALID_APP_ROLES.has(upperRole)) {
    throw new AppError(400, 'INVALID_ROLE', `Role must be one of: ${Array.from(VALID_APP_ROLES).join(', ')}`);
  }

  const targetUser = await adminRepository.getAdminUserById(userId.trim());
  if (!targetUser) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User profile was not found');
  }

  const updatedRoles = await adminRepository.removeUserRole(targetUser.id, upperRole);

  await logAuditEventSafe(
    adminUser,
    reqContext,
    'REMOVE_USER_ROLE',
    'USER_ROLE',
    targetUser.id,
    {
      removedRole: upperRole,
      currentRoles: updatedRoles,
    }
  );

  return {
    userId: targetUser.id,
    roles: updatedRoles,
  };
};

const setUserRoles = async (userId, roles = [], adminUser, reqContext = {}) => {
  if (!isSuperAdmin(adminUser)) {
    throw new AppError(403, 'FORBIDDEN', 'Only Super Administrators can set user roles');
  }

  if (!userId || typeof userId !== 'string') {
    throw new AppError(400, 'INVALID_ID', 'User ID is required');
  }

  if (!Array.isArray(roles) || roles.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Roles must be a non-empty array of valid app roles');
  }

  const normalizedRoles = [];
  for (const r of roles) {
    const upper = String(r || '').toUpperCase().trim();
    if (!VALID_APP_ROLES.has(upper)) {
      throw new AppError(400, 'INVALID_ROLE', `Invalid role: '${r}'. Allowed: ${Array.from(VALID_APP_ROLES).join(', ')}`);
    }
    if (!normalizedRoles.includes(upper)) {
      normalizedRoles.push(upper);
    }
  }

  const targetUser = await adminRepository.getAdminUserById(userId.trim());
  if (!targetUser) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User profile was not found');
  }

  const updatedRoles = await adminRepository.setUserRoles(targetUser.id, normalizedRoles);

  await logAuditEventSafe(
    adminUser,
    reqContext,
    'SET_USER_ROLES',
    'USER_ROLE',
    targetUser.id,
    {
      previousRoles: targetUser.roles,
      newRoles: updatedRoles,
    }
  );

  return {
    userId: targetUser.id,
    roles: updatedRoles,
  };
};

// ==========================================
// 9. AUDIT LOG RETRIEVAL
// ==========================================

const listAuditLogs = async (query = {}, adminUser) => {
  const { limit, offset } = normalizePagination(query.limit, query.offset);

  const [logs, totalCount] = await Promise.all([
    auditRepository.listAuditLogs({
      actorUserId: query.actorUserId,
      resourceType: query.resourceType,
      resourceId: query.resourceId,
      action: query.action,
      startDate: query.startDate,
      endDate: query.endDate,
      limit,
      offset,
    }),
    auditRepository.countAuditLogs({
      actorUserId: query.actorUserId,
      resourceType: query.resourceType,
      resourceId: query.resourceId,
      action: query.action,
      startDate: query.startDate,
      endDate: query.endDate,
    }),
  ]);

  return {
    auditLogs: logs,
    pagination: {
      total: totalCount,
      limit,
      offset,
      count: logs.length,
    },
  };
};

const getAuditLogDetails = async (auditLogId, adminUser) => {
  if (!auditLogId || typeof auditLogId !== 'string') {
    throw new AppError(400, 'INVALID_ID', 'Audit log ID is required');
  }

  const log = await auditRepository.getAuditLogById(auditLogId.trim());
  if (!log) {
    throw new AppError(404, 'AUDIT_LOG_NOT_FOUND', 'Audit log entry was not found');
  }

  return log;
};

module.exports = {
  // Stats
  getDashboardSummary,
  // Vendors
  listVendors,
  getVendorDetails,
  moderateVendor,
  // Products
  listProducts,
  getProductDetails,
  updateProduct,
  deleteProduct,
  // Marketplace
  listMarketplaceListings,
  getMarketplaceListingDetails,
  moderateMarketplaceListing,
  // Services
  listServices,
  getServiceDetails,
  updateService,
  // Orders
  listOrders,
  getOrderDetails,
  updateOrderStatus,
  // Deliveries
  listDeliveries,
  getDeliveryDetails,
  updateDeliveryStatus,
  // Users & Roles
  listUsers,
  getUserDetails,
  updateUserStatus,
  assignRole,
  removeRole,
  setUserRoles,
  // Audit Logs
  listAuditLogs,
  getAuditLogDetails,
  // Constants & helpers
  VALID_VENDOR_STATUSES,
  VALID_LISTING_STATUSES,
  VALID_ORDER_STATUSES,
  VALID_DELIVERY_STATUSES,
  VALID_APP_ROLES,
  isSuperAdmin,
};
