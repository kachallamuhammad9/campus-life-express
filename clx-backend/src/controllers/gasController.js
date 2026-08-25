const gasService = require('../services/gasService');
const config = require('../config/env');
const { sendSuccess } = require('../utils/response');

/**
 * Google Apps Script Integration Controller
 */

/**
 * GET /api/v1/integrations/gas/status
 * Get integration health and capability metadata
 */
const getStatus = async (req, res, next) => {
  try {
    const statusData = {
      integration: 'Google Apps Script (GAS)',
      version: '1.0.0',
      status: 'ACTIVE',
      authenticatedAs: req.gasAuth ? req.gasAuth.caller : 'UNKNOWN',
      authType: req.gasAuth ? req.gasAuth.type : 'UNKNOWN',
      webhookConfigured: Boolean(config.gasWebhookUrl),
      signatureVerificationEnabled: Boolean(config.gasWebhookSecret),
      capabilities: [
        'ADMIN_SALES_REPORTING',
        'CAMPUS_PERFORMANCE_SUMMARIES',
        'VENDOR_ANALYTICS',
        'DATA_EXPORT_CSV_JSON',
        'SYSTEM_BACKUP_SNAPSHOTS',
        'NOTIFICATION_DISPATCH_HOOKS',
        'MARKETPLACE_MODERATION_SYNC',
      ],
      timestamp: new Date().toISOString(),
    };

    return sendSuccess(res, statusData);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/integrations/gas/reports/sales
 * Administrative sales report with aggregated financial metrics
 */
const getSalesReport = async (req, res, next) => {
  try {
    const { startDate, endDate, campusId } = req.query;
    const report = await gasService.getSalesReport({
      startDate,
      endDate,
      campusId,
    });
    return sendSuccess(res, report);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/integrations/gas/reports/campus-summary
 * Campus-by-campus summary metrics
 */
const getCampusSummary = async (req, res, next) => {
  try {
    const { startDate, endDate, campusId } = req.query;
    const summary = await gasService.getCampusSummary({
      startDate,
      endDate,
      campusId,
    });
    return sendSuccess(res, summary);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/integrations/gas/reports/vendor-analytics
 * Vendor performance rankings and revenue analytics
 */
const getVendorAnalytics = async (req, res, next) => {
  try {
    const { startDate, endDate, campusId, vendorId, limit, offset } = req.query;
    const analytics = await gasService.getVendorAnalytics({
      startDate,
      endDate,
      campusId,
      vendorId,
      limit,
      offset,
    });
    return sendSuccess(res, analytics);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/integrations/gas/export/:domain
 * Export domain dataset in JSON or RFC 4180 CSV format
 */
const exportDataset = async (req, res, next) => {
  try {
    const { domain } = req.params;
    const {
      format = 'json',
      startDate,
      endDate,
      campusId,
      status,
      paymentStatus,
      limit,
      offset,
    } = req.query;

    const result = await gasService.exportDataset({
      domain,
      format,
      startDate,
      endDate,
      campusId,
      status,
      paymentStatus,
      limit,
      offset,
    });

    if (result.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.filename}"`
      );
      return res.status(200).send(result.content);
    }

    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/integrations/gas/export/snapshot
 * Comprehensive system backup snapshot
 */
const getBackupSnapshot = async (req, res, next) => {
  try {
    const snapshot = await gasService.getSystemBackupSnapshot();
    return sendSuccess(res, snapshot);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/integrations/gas/notifications/dispatch
 * Dispatch notification event hook
 */
const dispatchNotification = async (req, res, next) => {
  try {
    const {
      eventType,
      entityId,
      payload,
      recipientEmail,
      recipientPhone,
      metadata,
    } = req.body || {};

    const dispatchResult = await gasService.dispatchNotificationHook({
      eventType,
      entityId,
      payload,
      recipientEmail,
      recipientPhone,
      metadata,
    });

    return sendSuccess(res, dispatchResult, 200);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/integrations/gas/notifications/logs
 * Retrieve history logs of dispatched notification hooks
 */
const getNotificationLogs = async (req, res, next) => {
  try {
    const { limit, offset, eventType } = req.query;
    const logs = gasService.getNotificationDispatchLogs({
      limit,
      offset,
      eventType,
    });
    return sendSuccess(res, logs);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/integrations/gas/sync/marketplace-moderation
 * Sync listing moderation action from Google Apps Script
 */
const syncMarketplaceModeration = async (req, res, next) => {
  try {
    const { listingId, action, reason, moderatorNotes } = req.body || {};
    const moderationResult = await gasService.syncMarketplaceModeration({
      listingId,
      action,
      reason,
      moderatorNotes,
      moderatorUser: req.user || null,
    });

    return sendSuccess(res, moderationResult, 200);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getStatus,
  getSalesReport,
  getCampusSummary,
  getVendorAnalytics,
  exportDataset,
  getBackupSnapshot,
  dispatchNotification,
  getNotificationLogs,
  syncMarketplaceModeration,
};
