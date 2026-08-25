const express = require('express');
const gasController = require('../controllers/gasController');
const { requireGasAuth } = require('../middleware/gasAuth');

const router = express.Router();

// Enforce Google Apps Script integration security boundary
router.use(requireGasAuth);

// Integration Status & Capabilities
router.get('/status', gasController.getStatus);

// Administrative Reporting Endpoints
router.get('/reports/sales', gasController.getSalesReport);
router.get('/reports/campus-summary', gasController.getCampusSummary);
router.get('/reports/vendor-analytics', gasController.getVendorAnalytics);

// Backup & Data Export Endpoints
router.get('/export/snapshot', gasController.getBackupSnapshot);
router.get('/export/:domain', gasController.exportDataset);

// Notification Dispatching Hook Interfaces
router.post('/notifications/dispatch', gasController.dispatchNotification);
router.get('/notifications/logs', gasController.getNotificationLogs);

// Workflow Automation & Sync Endpoints
router.post(
  '/sync/marketplace-moderation',
  gasController.syncMarketplaceModeration
);

module.exports = router;
