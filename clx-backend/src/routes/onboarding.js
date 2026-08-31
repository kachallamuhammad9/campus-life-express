const express = require('express');
const onboardingController = require('../controllers/onboardingController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Public: anyone (including prospective vendors) can submit an application
router.post('/vendor', onboardingController.submitVendorApplication);

// Admin only: review queue
router.get('/vendor', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), onboardingController.listVendorApplications);
router.post('/vendor/:applicationId/review', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), onboardingController.reviewVendorApplication);
router.patch('/vendor/:applicationId/review', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), onboardingController.reviewVendorApplication);

module.exports = router;
