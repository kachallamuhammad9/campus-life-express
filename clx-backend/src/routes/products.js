const express = require('express');
const productController = require('../controllers/productController');

const router = express.Router();

router.get('/', productController.listProducts);
router.get('/:productId/reviews', productController.listProductReviews);
router.get('/:productId', productController.getProduct);

module.exports = router;
