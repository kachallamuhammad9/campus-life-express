const express = require('express');
const vendorController = require('../controllers/vendorController');

const router = express.Router();

router.get('/', vendorController.listVendors);
router.get('/:vendorId/products', vendorController.listVendorProducts);
router.get('/:vendorId/reviews', vendorController.listVendorReviews);
router.get('/:vendorId', vendorController.getVendor);

module.exports = router;
