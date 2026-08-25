const express = require('express');
const marketplaceController = require('../controllers/marketplaceController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', marketplaceController.listListings);
router.post('/', requireAuth, marketplaceController.createListing);
router.get('/:listingId', marketplaceController.getListing);
router.patch('/:listingId', requireAuth, marketplaceController.updateListing);
router.delete('/:listingId', requireAuth, marketplaceController.deleteListing);

module.exports = router;
