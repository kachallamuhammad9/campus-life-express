const express = require('express');
const orderController = require('../controllers/orderController');
const { requireAuth } = require('../middleware/auth');
const { orderLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// All order operations require authentication
router.use(requireAuth);

router.post('/', orderLimiter, orderController.createOrder);
router.get('/', orderController.getOrders);
router.get('/:orderId', orderController.getOrder);

module.exports = router;
