/**
 * Admin Controller
 * HTTP request handlers for admin panel, moderation, auditing, and analytics.
 */

const adminService = require('../services/adminService');
const { sendSuccess } = require('../utils/response');

const getRequestContext = (req) => ({
  ip: req.ip || req.connection?.remoteAddress || null,
  userAgent: req.headers ? req.headers['user-agent'] : null,
});

// ==========================================
// 1. DASHBOARD & STATS
// ==========================================

const getDashboardStats = async (req, res, next) => {
  try {
    const stats = await adminService.getDashboardSummary(req.query, req.user);
    return sendSuccess(res, stats);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// 2. VENDORS MODERATION
// ==========================================

const listVendors = async (req, res, next) => {
  try {
    const result = await adminService.listVendors(req.query, req.user);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const getVendor = async (req, res, next) => {
  try {
    const vendor = await adminService.getVendorDetails(req.params.vendorId, req.user);
    return sendSuccess(res, vendor);
  } catch (err) {
    next(err);
  }
};

const moderateVendor = async (req, res, next) => {
  try {
    const updated = await adminService.moderateVendor(
      req.params.vendorId,
      req.body,
      req.user,
      getRequestContext(req)
    );
    return sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// 3. PRODUCTS MODERATION
// ==========================================

const listProducts = async (req, res, next) => {
  try {
    const result = await adminService.listProducts(req.query, req.user);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const getProduct = async (req, res, next) => {
  try {
    const product = await adminService.getProductDetails(req.params.productId, req.user);
    return sendSuccess(res, product);
  } catch (err) {
    next(err);
  }
};

const updateProduct = async (req, res, next) => {
  try {
    const updated = await adminService.updateProduct(
      req.params.productId,
      req.body,
      req.user,
      getRequestContext(req)
    );
    return sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
};

const deleteProduct = async (req, res, next) => {
  try {
    const result = await adminService.deleteProduct(
      req.params.productId,
      req.user,
      getRequestContext(req)
    );
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// 4. MARKETPLACE MODERATION
// ==========================================

const listMarketplaceListings = async (req, res, next) => {
  try {
    const result = await adminService.listMarketplaceListings(req.query, req.user);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const getMarketplaceListing = async (req, res, next) => {
  try {
    const listing = await adminService.getMarketplaceListingDetails(req.params.listingId, req.user);
    return sendSuccess(res, listing);
  } catch (err) {
    next(err);
  }
};

const moderateMarketplaceListing = async (req, res, next) => {
  try {
    const updated = await adminService.moderateMarketplaceListing(
      req.params.listingId,
      req.body,
      req.user,
      getRequestContext(req)
    );
    return sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// 5. SERVICES MODERATION
// ==========================================

const listServices = async (req, res, next) => {
  try {
    const result = await adminService.listServices(req.query, req.user);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const getService = async (req, res, next) => {
  try {
    const service = await adminService.getServiceDetails(req.params.serviceId, req.user);
    return sendSuccess(res, service);
  } catch (err) {
    next(err);
  }
};

const updateService = async (req, res, next) => {
  try {
    const updated = await adminService.updateService(
      req.params.serviceId,
      req.body,
      req.user,
      getRequestContext(req)
    );
    return sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// 6. ORDERS INSPECTION & MANAGEMENT
// ==========================================

const listOrders = async (req, res, next) => {
  try {
    const result = await adminService.listOrders(req.query, req.user);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const getOrder = async (req, res, next) => {
  try {
    const order = await adminService.getOrderDetails(req.params.orderId, req.user);
    return sendSuccess(res, order);
  } catch (err) {
    next(err);
  }
};

const updateOrderStatus = async (req, res, next) => {
  try {
    const updated = await adminService.updateOrderStatus(
      req.params.orderId,
      req.body,
      req.user,
      getRequestContext(req)
    );
    return sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// 7. DELIVERIES INSPECTION & MANAGEMENT
// ==========================================

const listDeliveries = async (req, res, next) => {
  try {
    const result = await adminService.listDeliveries(req.query, req.user);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const getDelivery = async (req, res, next) => {
  try {
    const delivery = await adminService.getDeliveryDetails(req.params.deliveryId, req.user);
    return sendSuccess(res, delivery);
  } catch (err) {
    next(err);
  }
};

const updateDeliveryStatus = async (req, res, next) => {
  try {
    const updated = await adminService.updateDeliveryStatus(
      req.params.deliveryId,
      req.body,
      req.user,
      getRequestContext(req)
    );
    return sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// 8. USER & ROLE MANAGEMENT
// ==========================================

const listUsers = async (req, res, next) => {
  try {
    const result = await adminService.listUsers(req.query, req.user);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const getUser = async (req, res, next) => {
  try {
    const user = await adminService.getUserDetails(req.params.userId, req.user);
    return sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
};

const updateUserStatus = async (req, res, next) => {
  try {
    const updated = await adminService.updateUserStatus(
      req.params.userId,
      req.body,
      req.user,
      getRequestContext(req)
    );
    return sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
};

const assignRole = async (req, res, next) => {
  try {
    const result = await adminService.assignRole(
      req.params.userId,
      req.body.role || req.params.role,
      req.user,
      getRequestContext(req)
    );
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const removeRole = async (req, res, next) => {
  try {
    const result = await adminService.removeRole(
      req.params.userId,
      req.params.role || req.body.role,
      req.user,
      getRequestContext(req)
    );
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const setUserRoles = async (req, res, next) => {
  try {
    const result = await adminService.setUserRoles(
      req.params.userId,
      req.body.roles,
      req.user,
      getRequestContext(req)
    );
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// 9. AUDIT LOGS
// ==========================================

const listAuditLogs = async (req, res, next) => {
  try {
    const result = await adminService.listAuditLogs(req.query, req.user);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const getAuditLog = async (req, res, next) => {
  try {
    const log = await adminService.getAuditLogDetails(req.params.logId, req.user);
    return sendSuccess(res, log);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getDashboardStats,
  listVendors,
  getVendor,
  moderateVendor,
  listProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  listMarketplaceListings,
  getMarketplaceListing,
  moderateMarketplaceListing,
  listServices,
  getService,
  updateService,
  listOrders,
  getOrder,
  updateOrderStatus,
  listDeliveries,
  getDelivery,
  updateDeliveryStatus,
  listUsers,
  getUser,
  updateUserStatus,
  assignRole,
  removeRole,
  setUserRoles,
  listAuditLogs,
  getAuditLog,
};
