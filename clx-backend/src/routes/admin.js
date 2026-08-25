/**
 * Admin Routes
 * Endpoints for administration, dashboard analytics, moderation,
 * order/delivery inspection, user role management, and audit logs.
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAuth, requireRole } = require('../middleware/auth');

// All admin routes require authentication and at least ADMIN or SUPER_ADMIN role
router.use(requireAuth);
router.use(requireRole('ADMIN', 'SUPER_ADMIN'));

// 1. Dashboard Statistics & Analytics
router.get('/stats', adminController.getDashboardStats);
router.get('/dashboard', adminController.getDashboardStats);

// 2. Vendor Management & Moderation
router.get('/vendors', adminController.listVendors);
router.get('/vendors/:vendorId', adminController.getVendor);
router.patch('/vendors/:vendorId/status', adminController.moderateVendor);
router.patch('/vendors/:vendorId', adminController.moderateVendor);

// 3. Product / Catalog Moderation
router.get('/products', adminController.listProducts);
router.get('/products/:productId', adminController.getProduct);
router.patch('/products/:productId', adminController.updateProduct);
router.delete('/products/:productId', adminController.deleteProduct);

// 4. Student Marketplace Moderation
router.get('/marketplace/listings', adminController.listMarketplaceListings);
router.get('/marketplace/listings/:listingId', adminController.getMarketplaceListing);
router.post('/marketplace/listings/:listingId/moderate', adminController.moderateMarketplaceListing);
router.patch('/marketplace/listings/:listingId/status', adminController.moderateMarketplaceListing);

// 5. Services Moderation & Management
router.get('/services', adminController.listServices);
router.get('/services/:serviceId', adminController.getService);
router.patch('/services/:serviceId', adminController.updateService);

// 6. Order Inspection & Management
router.get('/orders', adminController.listOrders);
router.get('/orders/:orderId', adminController.getOrder);
router.patch('/orders/:orderId/status', adminController.updateOrderStatus);

// 7. Delivery Inspection & Management
router.get('/deliveries', adminController.listDeliveries);
router.get('/deliveries/:deliveryId', adminController.getDelivery);
router.patch('/deliveries/:deliveryId/status', adminController.updateDeliveryStatus);

// 8. User & Profile Inspection
router.get('/users', adminController.listUsers);
router.get('/users/:userId', adminController.getUser);
router.patch('/users/:userId/status', adminController.updateUserStatus);

// 9. SUPER_ADMIN Role Management (Super Admin only)
router.post('/users/:userId/roles', requireRole('SUPER_ADMIN'), adminController.assignRole);
router.delete('/users/:userId/roles/:role', requireRole('SUPER_ADMIN'), adminController.removeRole);
router.put('/users/:userId/roles', requireRole('SUPER_ADMIN'), adminController.setUserRoles);

// 10. Audit Logs
router.get('/audit-logs', adminController.listAuditLogs);
router.get('/audit-logs/:logId', adminController.getAuditLog);

module.exports = router;
