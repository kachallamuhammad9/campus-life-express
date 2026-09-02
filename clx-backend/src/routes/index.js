/**
 * Main Routes Handler
 * Organizes all API routes
 */

const express = require('express');
const healthRoutes = require('./health');
const campusRoutes = require('./campuses');
const categoryRoutes = require('./categories');
const vendorRoutes = require('./vendors');
const productRoutes = require('./products');
const serviceRoutes = require('./services');
const marketplaceRoutes = require('./marketplace');
const cartRoutes = require('./cart');
const orderRoutes = require('./orders');
const deliveryRoutes = require('./deliveries');
const paymentRoutes = require('./payments');
const gasRoutes = require('./gas');
const notificationRoutes = require('./notifications');
const adminRoutes = require('./admin');
const authRoutes = require('./auth');
const { sendSuccess } = require('../utils/response');

const router = express.Router();

// Health check endpoint (v1)
router.use('/api/v1', healthRoutes);
router.use('/api/v1/auth', authRoutes);
router.use('/api/v1/admin', adminRoutes);
router.use('/api/v1/campuses', campusRoutes);
router.use('/api/v1/categories', categoryRoutes);
router.use('/api/v1/vendors', vendorRoutes);
router.use('/api/v1/products', productRoutes);
router.use('/api/v1/services', serviceRoutes);
router.use('/api/v1/marketplace', marketplaceRoutes);
router.use('/api/v1/cart', cartRoutes);
router.use('/api/v1/orders', orderRoutes);
router.use('/api/v1/deliveries', deliveryRoutes);
router.use('/api/v1/payments', paymentRoutes);
router.use('/api/v1/notifications', notificationRoutes);
router.use('/api/v1/integrations/gas', gasRoutes);
router.use('/api/v1/integrations/google-apps-script', gasRoutes);

// Root route for reference
router.get('/', (req, res) => {
  return sendSuccess(res, {
    name: 'Campus Life Express (CLX) API',
    version: '1.0.0',
    status: 'running',
    healthEndpoint: '/api/v1/health',
  });
});

module.exports = router;
