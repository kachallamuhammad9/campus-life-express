const express = require('express');
const serviceController = require('../controllers/serviceController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', serviceController.listServices);
router.get('/requests/:requestId', serviceController.getServiceRequest);
router.post('/:serviceId/requests', requireAuth, serviceController.createServiceRequest);
router.get('/:serviceId', serviceController.getService);

module.exports = router;
