const express = require('express');
const deliveryController = require('../controllers/deliveryController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// All delivery operations require authentication
router.use(requireAuth);

// Customer endpoints
router.post('/', deliveryController.createDelivery);
router.get('/', deliveryController.getCustomerDeliveries);

// Rider endpoints (must precede :deliveryId wildcard)
router.get(
  '/assigned',
  requireRole('RIDER', 'ADMIN', 'SUPER_ADMIN'),
  deliveryController.getRiderAssignedDeliveries
);

router.get(
  '/available',
  requireRole('RIDER', 'ADMIN', 'SUPER_ADMIN'),
  deliveryController.getAvailableDeliveries
);

// Detail & action endpoints
router.get('/:deliveryId', deliveryController.getDelivery);

router.post(
  '/:deliveryId/accept',
  requireRole('RIDER', 'ADMIN', 'SUPER_ADMIN'),
  deliveryController.acceptDelivery
);

router.patch('/:deliveryId/status', deliveryController.updateDeliveryStatus);

module.exports = router;
