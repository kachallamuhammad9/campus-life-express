const express = require('express');
const campusController = require('../controllers/campusController');

const router = express.Router();

router.get('/', campusController.listCampuses);
router.get('/:campusId/delivery-zones', campusController.listDeliveryZones);
router.get('/:campusId', campusController.getCampus);

module.exports = router;
