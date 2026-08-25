const express = require('express');
const cartController = require('../controllers/cartController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// All cart operations require authentication
router.use(requireAuth);

router.get('/', cartController.getCart);
router.post('/items', cartController.addItem);
router.patch('/items/:itemId', cartController.updateItem);
router.delete('/items/:itemId', cartController.removeItem);
router.delete('/', cartController.clearCart);

module.exports = router;
