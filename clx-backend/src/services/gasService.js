const crypto = require('crypto');
const config = require('../config/env');
const gasRepository = require('../repositories/gasRepository');
const marketplaceRepository = require('../repositories/marketplaceRepository');
const { AppError } = require('../utils/AppError');

/**
 * Format integer kobo amount into Nigerian Naira string (₦)
 */
const formatNaira = (kobo) => {
  const amount = Number(kobo || 0) / 100;
  return `₦${amount.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/**
 * Convert kobo to decimal Naira number
 */
const koboToNaira = (kobo) => {
  return Number((Number(kobo || 0) / 100).toFixed(2));
};

/**
 * Escape and format value for RFC 4180 CSV compliance
 */
const formatCsvValue = (val) => {
  if (val === null || val === undefined) {
    return '';
  }
  if (typeof val === 'object') {
    val = JSON.stringify(val);
  } else {
    val = String(val);
  }
  if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
};

/**
 * Convert array of objects to standard CSV string
 */
const arrayToCsv = (rows) => {
  if (!rows || !rows.length) {
    return '';
  }
  const headers = Object.keys(rows[0]);
  const headerLine = headers.map(formatCsvValue).join(',');
  const dataLines = rows.map((row) =>
    headers.map((h) => formatCsvValue(row[h])).join(',')
  );
  return [headerLine, ...dataLines].join('\r\n');
};

/**
 * In-memory notification dispatch event log buffer
 */
const MAX_LOGS = 100;
const notificationDispatchLogs = [];

/**
 * Allowed Notification Event Types
 */
const ALLOWED_EVENT_TYPES = [
  'ORDER_CREATED',
  'ORDER_STATUS_CHANGED',
  'PAYMENT_RECEIVED',
  'SERVICE_REQUEST_CREATED',
  'DELIVERY_ASSIGNED',
  'MARKETPLACE_LISTING_FLAGGED',
  'MARKETPLACE_LISTING_MODERATED',
  'SYSTEM_ALERT',
];

/**
 * Allowed Export Domains
 */
const ALLOWED_EXPORT_DOMAINS = [
  'orders',
  'vendors',
  'marketplace',
  'deliveries',
  'services',
];

/**
 * Generate Administrative Sales Report
 */
const getSalesReport = async (filters = {}) => {
  const { startDate, endDate, campusId } = filters;

  if (startDate && isNaN(Date.parse(startDate))) {
    throw new AppError(400, 'INVALID_DATE_FORMAT', 'Invalid startDate format. Expected ISO 8601 string');
  }
  if (endDate && isNaN(Date.parse(endDate))) {
    throw new AppError(400, 'INVALID_DATE_FORMAT', 'Invalid endDate format. Expected ISO 8601 string');
  }

  const rawReport = await gasRepository.getSalesReport({
    startDate,
    endDate,
    campusId,
  });

  const summary = rawReport.summary || {};
  const totalGmvKobo = Number(summary.total_gmv_kobo || 0);
  const totalPaidRevenueKobo = Number(summary.total_paid_revenue_kobo || 0);
  const avgOrderValueKobo = Number(summary.avg_order_value_kobo || 0);

  const formattedSummary = {
    totalOrders: Number(summary.total_orders || 0),
    deliveredOrders: Number(summary.delivered_orders || 0),
    cancelledOrders: Number(summary.cancelled_orders || 0),
    pendingOrders: Number(summary.pending_orders || 0),
    confirmedOrders: Number(summary.confirmed_orders || 0),
    paidOrders: Number(summary.paid_orders || 0),
    pendingPaymentOrders: Number(summary.pending_payment_orders || 0),
    fulfillmentRatePercent:
      Number(summary.total_orders || 0) > 0
        ? Number(
            (
              (Number(summary.delivered_orders || 0) /
                Number(summary.total_orders || 0)) *
              100
            ).toFixed(1)
          )
        : 0,
    totalGmvKobo,
    totalGmvNaira: koboToNaira(totalGmvKobo),
    totalGmvFormatted: formatNaira(totalGmvKobo),
    totalPaidRevenueKobo,
    totalPaidRevenueNaira: koboToNaira(totalPaidRevenueKobo),
    totalPaidRevenueFormatted: formatNaira(totalPaidRevenueKobo),
    totalDeliveryFeesKobo: Number(summary.total_delivery_fees_kobo || 0),
    totalServiceFeesKobo: Number(summary.total_service_fees_kobo || 0),
    avgOrderValueKobo,
    avgOrderValueNaira: koboToNaira(avgOrderValueKobo),
    avgOrderValueFormatted: formatNaira(avgOrderValueKobo),
  };

  const formattedCampuses = (rawReport.campuses || []).map((c) => ({
    campusId: c.campus_id,
    campusName: c.campus_name,
    campusCode: c.campus_code,
    campusSlug: c.campus_slug,
    orderCount: Number(c.order_count || 0),
    totalKobo: Number(c.total_kobo || 0),
    totalNaira: koboToNaira(c.total_kobo),
    totalFormatted: formatNaira(c.total_kobo),
    paidRevenueKobo: Number(c.paid_revenue_kobo || 0),
    paidRevenueFormatted: formatNaira(c.paid_revenue_kobo),
  }));

  const formattedPaymentMethods = (rawReport.paymentMethods || []).map((pm) => ({
    paymentMethod: pm.payment_method,
    orderCount: Number(pm.order_count || 0),
    totalKobo: Number(pm.total_kobo || 0),
    totalFormatted: formatNaira(pm.total_kobo),
  }));

  const formattedOrderStatuses = (rawReport.orderStatuses || []).map((os) => ({
    orderStatus: os.order_status,
    orderCount: Number(os.order_count || 0),
    totalKobo: Number(os.total_kobo || 0),
    totalFormatted: formatNaira(os.total_kobo),
  }));

  const formattedTimeline = (rawReport.dailyTimeline || []).map((dt) => ({
    date: dt.report_date,
    orderCount: Number(dt.order_count || 0),
    totalKobo: Number(dt.total_kobo || 0),
    totalFormatted: formatNaira(dt.total_kobo),
    paidKobo: Number(dt.paid_kobo || 0),
    paidFormatted: formatNaira(dt.paid_kobo),
  }));

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      startDate: startDate || null,
      endDate: endDate || null,
      campusId: campusId || null,
    },
    summary: formattedSummary,
    campuses: formattedCampuses,
    paymentMethods: formattedPaymentMethods,
    orderStatuses: formattedOrderStatuses,
    dailyTimeline: formattedTimeline,
  };
};

/**
 * Generate Campus Performance Summaries
 */
const getCampusSummary = async (filters = {}) => {
  const { startDate, endDate, campusId } = filters;

  if (startDate && isNaN(Date.parse(startDate))) {
    throw new AppError(400, 'INVALID_DATE_FORMAT', 'Invalid startDate format');
  }
  if (endDate && isNaN(Date.parse(endDate))) {
    throw new AppError(400, 'INVALID_DATE_FORMAT', 'Invalid endDate format');
  }

  const campuses = await gasRepository.getCampusSummary({
    startDate,
    endDate,
    campusId,
  });

  let totalActiveVendors = 0;
  let totalActiveProducts = 0;
  let totalActiveServices = 0;
  let totalOrdersCount = 0;
  let totalOrderRevenueKobo = 0n;
  let totalDeliveryRequests = 0;
  let totalServiceRequests = 0;

  const formattedCampuses = campuses.map((c) => {
    const revKobo = BigInt(c.total_order_revenue_kobo || 0);
    totalActiveVendors += Number(c.active_vendors_count || 0);
    totalActiveProducts += Number(c.active_products_count || 0);
    totalActiveServices += Number(c.active_services_count || 0);
    totalOrdersCount += Number(c.total_orders_count || 0);
    totalOrderRevenueKobo += revKobo;
    totalDeliveryRequests += Number(c.delivery_requests_count || 0);
    totalServiceRequests += Number(c.service_requests_count || 0);

    return {
      campusId: c.campus_id,
      campusName: c.campus_name,
      campusCode: c.campus_code,
      campusSlug: c.campus_slug,
      city: c.city,
      state: c.state,
      isActive: c.is_active,
      activeVendorsCount: Number(c.active_vendors_count || 0),
      activeProductsCount: Number(c.active_products_count || 0),
      activeServicesCount: Number(c.active_services_count || 0),
      activeMarketplaceCount: Number(c.active_marketplace_count || 0),
      totalOrdersCount: Number(c.total_orders_count || 0),
      totalOrderRevenueKobo: Number(revKobo),
      totalOrderRevenueFormatted: formatNaira(revKobo),
      deliveryRequestsCount: Number(c.delivery_requests_count || 0),
      serviceRequestsCount: Number(c.service_requests_count || 0),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    campusesCount: formattedCampuses.length,
    totals: {
      activeVendors: totalActiveVendors,
      activeProducts: totalActiveProducts,
      activeServices: totalActiveServices,
      totalOrders: totalOrdersCount,
      totalOrderRevenueKobo: Number(totalOrderRevenueKobo),
      totalOrderRevenueFormatted: formatNaira(totalOrderRevenueKobo),
      deliveryRequests: totalDeliveryRequests,
      serviceRequests: totalServiceRequests,
    },
    campuses: formattedCampuses,
  };
};

/**
 * Generate Vendor Analytics
 */
const getVendorAnalytics = async (filters = {}) => {
  const { startDate, endDate, campusId, vendorId, limit = 50, offset = 0 } = filters;

  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const normalizedOffset = Math.max(0, Number(offset) || 0);

  const rawVendors = await gasRepository.getVendorAnalytics({
    startDate,
    endDate,
    campusId,
    vendorId,
    limit: normalizedLimit,
    offset: normalizedOffset,
  });

  const vendors = rawVendors.map((v) => {
    const totalOrders = Number(v.total_orders || 0);
    const deliveredOrders = Number(v.delivered_orders || 0);
    const grossKobo = Number(v.total_gross_kobo || 0);
    const paidKobo = Number(v.total_paid_kobo || 0);

    return {
      vendorId: v.vendor_id,
      vendorName: v.vendor_name,
      vendorSlug: v.vendor_slug,
      vendorStatus: v.vendor_status,
      isVerified: v.is_verified,
      rating: Number(v.current_rating || 0),
      reviewCount: Number(v.review_count || 0),
      categoryName: v.category_name,
      categorySlug: v.category_slug,
      ownerName: v.owner_name,
      ownerEmail: v.owner_email,
      totalOrders,
      deliveredOrders,
      cancelledOrders: Number(v.cancelled_orders || 0),
      fulfillmentRatePercent:
        totalOrders > 0 ? Number(((deliveredOrders / totalOrders) * 100).toFixed(1)) : 0,
      totalGrossKobo: grossKobo,
      totalGrossFormatted: formatNaira(grossKobo),
      totalPaidKobo: paidKobo,
      totalPaidFormatted: formatNaira(paidKobo),
      activeProductsCount: Number(v.active_products_count || 0),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    pagination: {
      limit: normalizedLimit,
      offset: normalizedOffset,
      count: vendors.length,
    },
    vendors,
  };
};

/**
 * Export Domain Datasets (JSON or CSV)
 */
const exportDataset = async (params = {}) => {
  const {
    domain,
    format = 'json',
    startDate,
    endDate,
    campusId,
    status,
    paymentStatus,
    limit = 500,
    offset = 0,
  } = params;

  if (!domain || !ALLOWED_EXPORT_DOMAINS.includes(String(domain).toLowerCase())) {
    throw new AppError(
      400,
      'INVALID_EXPORT_DOMAIN',
      `Unsupported export domain '${domain}'. Allowed domains: ${ALLOWED_EXPORT_DOMAINS.join(', ')}`
    );
  }

  const normalizedDomain = String(domain).toLowerCase();
  const normalizedFormat = String(format || 'json').toLowerCase();
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 500, 1000));
  const normalizedOffset = Math.max(0, Number(offset) || 0);

  let rows = [];

  switch (normalizedDomain) {
    case 'orders':
      rows = await gasRepository.getExportOrders({
        startDate,
        endDate,
        campusId,
        status,
        paymentStatus,
        limit: normalizedLimit,
        offset: normalizedOffset,
      });
      break;

    case 'vendors':
      rows = await gasRepository.getExportVendors({
        campusId,
        status,
        limit: normalizedLimit,
        offset: normalizedOffset,
      });
      break;

    case 'marketplace':
      rows = await gasRepository.getExportMarketplaceListings({
        campusId,
        status,
        limit: normalizedLimit,
        offset: normalizedOffset,
      });
      break;

    case 'deliveries':
      rows = await gasRepository.getExportDeliveries({
        startDate,
        endDate,
        campusId,
        status,
        limit: normalizedLimit,
        offset: normalizedOffset,
      });
      break;

    case 'services':
      rows = await gasRepository.getExportServiceRequests({
        startDate,
        endDate,
        campusId,
        status,
        limit: normalizedLimit,
        offset: normalizedOffset,
      });
      break;

    default:
      throw new AppError(400, 'INVALID_EXPORT_DOMAIN', 'Unknown domain');
  }

  if (normalizedFormat === 'csv') {
    const csvContent = arrayToCsv(rows);
    return {
      format: 'csv',
      domain: normalizedDomain,
      content: csvContent,
      filename: `clx-${normalizedDomain}-export-${Date.now()}.csv`,
      rowCount: rows.length,
    };
  }

  return {
    format: 'json',
    domain: normalizedDomain,
    exportedAt: new Date().toISOString(),
    rowCount: rows.length,
    pagination: {
      limit: normalizedLimit,
      offset: normalizedOffset,
    },
    data: rows,
  };
};

/**
 * Retrieve Comprehensive System Backup Snapshot
 */
const getSystemBackupSnapshot = async () => {
  const snapshot = await gasRepository.getSystemSnapshot();

  const totalGmvKobo = Number(snapshot.platform_gmv_kobo || 0);
  const totalCollectedKobo = Number(snapshot.platform_collected_revenue_kobo || 0);

  return {
    snapshotId: crypto.randomUUID(),
    system: 'Campus Life Express (CLX) API',
    organization: 'Dandalin Sauki Ltd',
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
    metrics: {
      registeredProfiles: Number(snapshot.profiles_count || 0),
      activeCampuses: Number(snapshot.active_campuses_count || 0),
      activeVendors: Number(snapshot.active_vendors_count || 0),
      inStockProducts: Number(snapshot.in_stock_products_count || 0),
      activeServices: Number(snapshot.active_services_count || 0),
      publishedMarketplaceListings: Number(snapshot.published_listings_count || 0),
      totalOrders: Number(snapshot.total_orders_count || 0),
      deliveredOrders: Number(snapshot.delivered_orders_count || 0),
      deliveryRequests: Number(snapshot.delivery_requests_count || 0),
      serviceRequests: Number(snapshot.service_requests_count || 0),
      successfulPayments: Number(snapshot.successful_payments_count || 0),
      totalPlatformGmvKobo: totalGmvKobo,
      totalPlatformGmvFormatted: formatNaira(totalGmvKobo),
      totalCollectedRevenueKobo: totalCollectedKobo,
      totalCollectedRevenueFormatted: formatNaira(totalCollectedKobo),
    },
  };
};

/**
 * Dispatch Notification Hook to Google Apps Script Web App
 */
const dispatchNotificationHook = async ({
  eventType,
  entityId = null,
  payload = {},
  recipientEmail = null,
  recipientPhone = null,
  metadata = {},
}) => {
  if (!eventType || typeof eventType !== 'string') {
    throw new AppError(400, 'INVALID_EVENT_TYPE', 'eventType is required');
  }

  const normalizedEventType = eventType.trim().toUpperCase();
  if (!ALLOWED_EVENT_TYPES.includes(normalizedEventType)) {
    throw new AppError(
      400,
      'INVALID_EVENT_TYPE',
      `Unsupported eventType '${eventType}'. Allowed types: ${ALLOWED_EVENT_TYPES.join(', ')}`
    );
  }

  const eventId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const eventEnvelope = {
    eventId,
    eventType: normalizedEventType,
    timestamp,
    entityId: entityId ? String(entityId) : null,
    recipient: {
      email: recipientEmail ? String(recipientEmail).trim() : null,
      phone: recipientPhone ? String(recipientPhone).trim() : null,
    },
    payload: payload && typeof payload === 'object' ? payload : {},
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
  };

  // Compute HMAC SHA-256 signature
  let signature = null;
  if (config.gasWebhookSecret) {
    signature = crypto
      .createHmac('sha256', config.gasWebhookSecret)
      .update(JSON.stringify(eventEnvelope))
      .digest('hex');
  }

  let dispatchStatus = 'DISPATCHED_STUB';
  let responseData = null;
  let errorDetails = null;

  // If a live webhook URL is configured, attempt outbound HTTP POST dispatch
  if (config.gasWebhookUrl) {
    try {
      const response = await fetch(config.gasWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CLX-Event': normalizedEventType,
          'X-CLX-Event-ID': eventId,
          ...(signature ? { 'X-CLX-Signature': signature } : {}),
        },
        body: JSON.stringify(eventEnvelope),
      });

      if (response.ok) {
        dispatchStatus = 'DISPATCHED_SUCCESS';
        responseData = await response.text();
      } else {
        dispatchStatus = 'DISPATCHED_HTTP_ERROR';
        errorDetails = `HTTP ${response.status}: ${response.statusText}`;
      }
    } catch (netErr) {
      dispatchStatus = 'DISPATCHED_NETWORK_ERROR';
      errorDetails = netErr.message;
    }
  }

  const logEntry = {
    eventId,
    eventType: normalizedEventType,
    timestamp,
    entityId: eventEnvelope.entityId,
    recipientEmail: eventEnvelope.recipient.email,
    status: dispatchStatus,
    signature: signature ? `${signature.substring(0, 8)}...` : null,
    targetUrl: config.gasWebhookUrl ? 'CONFIGURED' : 'UNCONFIGURED_STUB_MODE',
    error: errorDetails,
  };

  // Push to circular buffer
  notificationDispatchLogs.unshift(logEntry);
  if (notificationDispatchLogs.length > MAX_LOGS) {
    notificationDispatchLogs.pop();
  }

  return {
    success: true,
    eventId,
    eventType: normalizedEventType,
    status: dispatchStatus,
    timestamp,
    signature,
    deliveryMode: config.gasWebhookUrl ? 'REMOTE_WEBHOOK' : 'LOCAL_STUB',
  };
};

/**
 * Retrieve Notification Dispatch History Logs
 */
const getNotificationDispatchLogs = ({ limit = 50, offset = 0, eventType = null } = {}) => {
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
  const normalizedOffset = Math.max(0, Number(offset) || 0);

  let filtered = [...notificationDispatchLogs];
  if (eventType) {
    const normalizedType = String(eventType).toUpperCase();
    filtered = filtered.filter((log) => log.eventType === normalizedType);
  }

  const paginated = filtered.slice(normalizedOffset, normalizedOffset + normalizedLimit);

  return {
    totalLogs: filtered.length,
    limit: normalizedLimit,
    offset: normalizedOffset,
    logs: paginated,
  };
};

/**
 * Clear Notification Logs (Helper for testing)
 */
const clearNotificationLogs = () => {
  notificationDispatchLogs.length = 0;
};

/**
 * Sync Marketplace Moderation from Google Apps Script
 */
const syncMarketplaceModeration = async ({
  listingId,
  action,
  reason = null,
  moderatorNotes = null,
  moderatorUser = null,
}) => {
  if (!listingId) {
    throw new AppError(400, 'MISSING_LISTING_ID', 'listingId is required');
  }

  if (!action || typeof action !== 'string') {
    throw new AppError(400, 'INVALID_ACTION', 'action is required (APPROVE, REJECT, FLAG_SUSPICIOUS)');
  }

  const normalizedAction = action.trim().toUpperCase();
  let targetStatus;
  let rejectionReason = null;

  switch (normalizedAction) {
    case 'APPROVE':
    case 'PUBLISH':
      targetStatus = 'PUBLISHED';
      break;

    case 'REJECT':
      targetStatus = 'REJECTED';
      rejectionReason = reason ? String(reason).trim() : 'Listing was rejected by campus moderator';
      break;

    case 'FLAG_SUSPICIOUS':
    case 'FLAG':
      targetStatus = 'SUSPENDED';
      rejectionReason = reason ? String(reason).trim() : 'Listing flagged for administrative review';
      break;

    default:
      throw new AppError(
        400,
        'INVALID_ACTION',
        `Unsupported moderation action '${action}'. Allowed: APPROVE, REJECT, FLAG_SUSPICIOUS`
      );
  }

  const existing = await marketplaceRepository.getListingById(listingId);
  if (!existing) {
    throw new AppError(404, 'LISTING_NOT_FOUND', `Marketplace listing with ID '${listingId}' was not found`);
  }

  const updateFields = {
    status: targetStatus,
  };

  if (rejectionReason) {
    updateFields.rejection_reason = rejectionReason;
  }

  const updated = await marketplaceRepository.updateListing(listingId, updateFields);

  // Dispatch moderation notification hook
  await dispatchNotificationHook({
    eventType: 'MARKETPLACE_LISTING_MODERATED',
    entityId: listingId,
    payload: {
      listingId,
      title: existing.title,
      previousStatus: existing.status,
      newStatus: targetStatus,
      action: normalizedAction,
      reason: rejectionReason,
      moderatorNotes,
    },
    recipientEmail: existing.seller_email || null,
    recipientPhone: existing.seller_contact_phone || null,
  });

  return {
    listingId,
    title: existing.title,
    previousStatus: existing.status,
    status: targetStatus,
    action: normalizedAction,
    rejectionReason: updateFields.rejection_reason || null,
    moderatorNotes: moderatorNotes || null,
    updatedAt: updated ? updated.updated_at : new Date().toISOString(),
  };
};

module.exports = {
  getSalesReport,
  getCampusSummary,
  getVendorAnalytics,
  exportDataset,
  getSystemBackupSnapshot,
  dispatchNotificationHook,
  getNotificationDispatchLogs,
  clearNotificationLogs,
  syncMarketplaceModeration,
  formatNaira,
  koboToNaira,
  arrayToCsv,
  formatCsvValue,
};
