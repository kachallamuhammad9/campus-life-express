const express = require('express');
const paymentController = require('../controllers/paymentController');
const { requireAuth } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Webhook endpoint (provider-agnostic stub, external callbacks)
router.post('/webhook', paymentController.handleWebhook);

// Protected customer payment operations
router.post('/initialize', requireAuth, paymentLimiter, paymentController.initializePayment);
router.post('/orders/:orderId/initialize', requireAuth, paymentLimiter, paymentController.initializePayment);
router.post('/cash-on-delivery', requireAuth, paymentLimiter, paymentController.confirmCashOnDelivery);
router.post('/orders/:orderId/cash-on-delivery', requireAuth, paymentLimiter, paymentController.confirmCashOnDelivery);
router.get('/orders/:orderId', requireAuth, paymentController.getOrderPayments);
router.get('/:paymentId', requireAuth, paymentController.getPaymentDetails);

module.exports = router;
