/**
 * Notification Service
 * Orchestrates in-app notification persistence, read status lifecycle,
 * transactional email dispatching via emailProvider, and Google Apps Script event hooks.
 */

const notificationRepository = require('../repositories/notificationRepository');
const emailProvider = require('../utils/emailProvider');
const gasService = require('./gasService');
const { AppError } = require('../utils/AppError');

const VALID_NOTIFICATION_TYPES = new Set([
  'ORDER_UPDATE',
  'SERVICE_UPDATE',
  'DELIVERY_UPDATE',
  'MARKETPLACE_UPDATE',
  'SYSTEM',
]);

/**
 * Normalizes pagination parameters
 */
const normalizePagination = (rawLimit, rawOffset, defaultLimit = 20, maxLimit = 100) => {
  let limit = Number.parseInt(rawLimit, 10);
  if (Number.isNaN(limit) || limit < 1) {
    limit = defaultLimit;
  }
  if (limit > maxLimit) {
    limit = maxLimit;
  }

  let offset = Number.parseInt(rawOffset, 10);
  if (Number.isNaN(offset) || offset < 0) {
    offset = 0;
  }

  return { limit, offset };
};

/**
 * Formats a notification database record into an API response object
 */
const formatNotification = (n) => {
  if (!n) return null;

  return {
    id: n.id,
    userId: n.user_id || n.userId,
    type: n.type,
    title: n.title || null,
    message: n.message,
    relatedOrderId: n.related_order_id || n.relatedOrderId || null,
    relatedServiceRequestId: n.related_service_request_id || n.relatedServiceRequestId || null,
    relatedDeliveryRequestId: n.related_delivery_request_id || n.relatedDeliveryRequestId || null,
    isRead: Boolean(n.is_read !== undefined ? n.is_read : n.isRead),
    readAt: n.read_at || n.readAt || null,
    createdAt: n.created_at || n.createdAt || null,
  };
};

/**
 * Check whether user has administrative role
 */
const isUserAdmin = (user) => {
  if (!user) return false;
  const roles = user.roles || (user.role ? [user.role] : []);
  return roles.includes('ADMIN') || roles.includes('SUPER_ADMIN');
};

/**
 * Retrieves notifications for an authenticated user with pagination and filters
 */
const getUserNotifications = async (user, query = {}) => {
  if (!user || !user.id) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  }

  const { limit, offset } = normalizePagination(query.limit, query.offset);

  let isReadFilter = null;
  if (query.unreadOnly === 'true' || query.unreadOnly === true || query.isRead === 'false' || query.isRead === false) {
    isReadFilter = false;
  } else if (query.isRead === 'true' || query.isRead === true) {
    isReadFilter = true;
  }

  let typeFilter = null;
  if (query.type) {
    const normalizedType = String(query.type).toUpperCase().trim();
    if (VALID_NOTIFICATION_TYPES.has(normalizedType)) {
      typeFilter = normalizedType;
    } else {
      throw new AppError(
        400,
        'INVALID_NOTIFICATION_TYPE',
        `Notification type must be one of: ${Array.from(VALID_NOTIFICATION_TYPES).join(', ')}`
      );
    }
  }

  // Admin may optionally query notifications of another user if targetUserId is explicitly provided
  let targetUserId = user.id;
  if (query.userId && isUserAdmin(user)) {
    targetUserId = String(query.userId).trim();
  }

  const [notifications, unreadCount] = await Promise.all([
    notificationRepository.getNotificationsByUser(targetUserId, {
      limit,
      offset,
      isRead: isReadFilter,
      type: typeFilter,
    }),
    notificationRepository.getUnreadCountByUser(targetUserId),
  ]);

  return {
    notifications: (notifications || []).map(formatNotification),
    unreadCount,
    pagination: {
      limit,
      offset,
      count: notifications ? notifications.length : 0,
    },
  };
};

/**
 * Retrieves unread notification count for an authenticated user
 */
const getUnreadNotificationCount = async (user) => {
  if (!user || !user.id) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  }
  const unreadCount = await notificationRepository.getUnreadCountByUser(user.id);
  return { unreadCount };
};

/**
 * Retrieves a single notification by ID, enforcing user ownership
 */
const getUserNotificationDetails = async (user, notificationId) => {
  if (!user || !user.id) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  }

  if (!notificationId) {
    throw new AppError(400, 'INVALID_NOTIFICATION_ID', 'Notification ID is required');
  }

  const notification = await notificationRepository.getNotificationById(notificationId);
  if (!notification) {
    throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification was not found');
  }

  // Cross-user ownership authorization
  if (notification.user_id !== user.id && !isUserAdmin(user)) {
    throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification was not found');
  }

  return {
    notification: formatNotification(notification),
  };
};

/**
 * Marks a single notification as read
 */
const markNotificationAsRead = async (user, notificationId) => {
  if (!user || !user.id) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  }

  if (!notificationId) {
    throw new AppError(400, 'INVALID_NOTIFICATION_ID', 'Notification ID is required');
  }

  const existing = await notificationRepository.getNotificationById(notificationId);
  if (!existing) {
    throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification was not found');
  }

  if (existing.user_id !== user.id && !isUserAdmin(user)) {
    throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification was not found');
  }

  // If already read, return current state
  if (existing.is_read) {
    return {
      notification: formatNotification(existing),
    };
  }

  const updated = await notificationRepository.markAsRead(
    notificationId,
    isUserAdmin(user) ? null : user.id
  );

  return {
    notification: formatNotification(updated),
  };
};

/**
 * Marks all unread notifications as read for the authenticated user
 */
const markAllNotificationsAsRead = async (user) => {
  if (!user || !user.id) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  }

  const result = await notificationRepository.markAllAsRead(user.id);

  return {
    updatedCount: result.updatedCount,
    message: result.updatedCount > 0
      ? `Successfully marked ${result.updatedCount} notification(s) as read`
      : 'No unread notifications to mark as read',
  };
};

/**
 * Deletes a notification belonging to the authenticated user
 */
const deleteUserNotification = async (user, notificationId) => {
  if (!user || !user.id) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  }

  if (!notificationId) {
    throw new AppError(400, 'INVALID_NOTIFICATION_ID', 'Notification ID is required');
  }

  const existing = await notificationRepository.getNotificationById(notificationId);
  if (!existing) {
    throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification was not found');
  }

  if (existing.user_id !== user.id && !isUserAdmin(user)) {
    throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification was not found');
  }

  const deleted = await notificationRepository.deleteNotification(
    notificationId,
    isUserAdmin(user) ? null : user.id
  );

  return {
    deleted,
    id: notificationId,
  };
};

/**
 * Creates an in-app notification and optionally triggers email & Google Apps Script hook
 */
const createAndDispatchNotification = async ({
  userId,
  type,
  title = null,
  message,
  relatedOrderId = null,
  relatedServiceRequestId = null,
  relatedDeliveryRequestId = null,
  emailRecipient = null,
  sendEmail = false,
  emailSubject = null,
  emailHtml = null,
  emailText = null,
  dispatchGas = false,
  gasEventType = null,
  gasPayload = null,
  metadata = {},
}) => {
  if (!userId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Target user ID is required for notification');
  }

  const normalizedType = String(type || 'SYSTEM').toUpperCase().trim();
  if (!VALID_NOTIFICATION_TYPES.has(normalizedType)) {
    throw new AppError(
      400,
      'INVALID_NOTIFICATION_TYPE',
      `Notification type '${type}' is invalid. Allowed: ${Array.from(VALID_NOTIFICATION_TYPES).join(', ')}`
    );
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Notification message is required');
  }

  // 1. Create In-App Notification Record in Database
  const notificationRecord = await notificationRepository.createNotification({
    userId,
    type: normalizedType,
    title: title ? String(title).trim() : null,
    message: String(message).trim(),
    relatedOrderId: relatedOrderId ? String(relatedOrderId) : null,
    relatedServiceRequestId: relatedServiceRequestId ? String(relatedServiceRequestId) : null,
    relatedDeliveryRequestId: relatedDeliveryRequestId ? String(relatedDeliveryRequestId) : null,
  });

  // 2. Optional Transactional Email Dispatch (Non-blocking provider abstraction)
  let emailResult = null;
  if ((sendEmail || emailRecipient) && emailRecipient) {
    try {
      emailResult = await emailProvider.sendEmail({
        to: emailRecipient,
        subject: emailSubject || title || `Campus Life Express Notification: ${normalizedType}`,
        text: emailText || message,
        html: emailHtml || `<p>${message}</p>`,
        template: normalizedType.toLowerCase(),
        metadata: {
          notificationId: notificationRecord ? notificationRecord.id : null,
          userId,
          type: normalizedType,
          ...metadata,
        },
      });
    } catch (err) {
      console.warn(`[NotificationService] Failed to send email to ${emailRecipient}:`, err.message);
      emailResult = { success: false, error: err.message };
    }
  }

  // 3. Optional Google Apps Script Outbound Hook Dispatch
  let gasResult = null;
  if (dispatchGas && gasEventType) {
    try {
      gasResult = await gasService.dispatchNotificationHook({
        eventType: gasEventType,
        entityId: relatedOrderId || relatedDeliveryRequestId || relatedServiceRequestId || (notificationRecord && notificationRecord.id),
        recipientEmail: emailRecipient,
        payload: gasPayload || {
          notificationId: notificationRecord ? notificationRecord.id : null,
          userId,
          title,
          message,
          type: normalizedType,
        },
        metadata,
      });
    } catch (gasErr) {
      console.warn(`[NotificationService] Failed to dispatch GAS hook for ${gasEventType}:`, gasErr.message);
      gasResult = { success: false, error: gasErr.message };
    }
  }

  return {
    notification: formatNotification(notificationRecord),
    emailResult,
    gasResult,
  };
};

/**
 * Safe Notification Wrapper
 * Executes notification creation and dispatching safely without throwing errors.
 * Ensures notification failures never interrupt core transactional flows (e.g. order checkout).
 */
const safeNotify = async (params) => {
  try {
    return await createAndDispatchNotification(params);
  } catch (err) {
    console.warn('[NotificationService:SafeNotify] Notification dispatch skipped due to error:', err.message);
    return {
      notification: null,
      error: err.message,
    };
  }
};

/**
 * Helper: Trigger notifications for newly created orders
 */
const notifyOrderCreated = async (order, options = {}) => {
  if (!order || !order.id) return null;

  const orderId = order.id;
  const customerId = order.user_id || order.userId;
  const customerEmail = options.customerEmail || null;
  const vendorOwnerId = options.vendorOwnerId || null;
  const vendorEmail = options.vendorEmail || null;
  const totalFormatted = options.totalFormatted || (order.total_kobo ? `₦${(order.total_kobo / 100).toFixed(2)}` : '');

  const results = [];

  // Customer In-App + Email Notification
  if (customerId) {
    const custRes = await safeNotify({
      userId: customerId,
      type: 'ORDER_UPDATE',
      title: 'Order Placed Successfully',
      message: `Your order #${orderId.substring(0, 8)} for ${totalFormatted || 'your items'} has been placed.`,
      relatedOrderId: orderId,
      emailRecipient: customerEmail,
      sendEmail: Boolean(customerEmail),
      emailSubject: `Order Confirmation #${orderId.substring(0, 8)} - Campus Life Express`,
      dispatchGas: true,
      gasEventType: 'ORDER_CREATED',
      gasPayload: {
        orderId,
        customerId,
        totalKobo: order.total_kobo || order.totalKobo,
        paymentMethod: order.payment_method || order.paymentMethod,
      },
    });
    results.push(custRes);
  }

  // Vendor Owner Notification (if vendor owner profile ID is known)
  if (vendorOwnerId && vendorOwnerId !== customerId) {
    const vendRes = await safeNotify({
      userId: vendorOwnerId,
      type: 'ORDER_UPDATE',
      title: 'New Order Received',
      message: `You have received a new order #${orderId.substring(0, 8)}.`,
      relatedOrderId: orderId,
      emailRecipient: vendorEmail,
      sendEmail: Boolean(vendorEmail),
      dispatchGas: false, // already dispatched once for the order
    });
    results.push(vendRes);
  }

  return results;
};

/**
 * Helper: Trigger notifications when order status changes
 */
const notifyOrderStatusChanged = async (order, previousStatus, newStatus, options = {}) => {
  if (!order || !order.id) return null;

  const customerId = order.user_id || order.userId;
  const customerEmail = options.customerEmail || null;

  const statusDisplayMap = {
    CONFIRMED: 'has been confirmed by the vendor',
    PREPARING: 'is now being prepared',
    READY: 'is ready for pickup/delivery',
    IN_TRANSIT: 'is on the way to your delivery address',
    DELIVERED: 'has been delivered successfully',
    CANCELLED: 'has been cancelled',
  };

  const statusText = statusDisplayMap[newStatus] || `status changed to ${newStatus}`;

  return await safeNotify({
    userId: customerId,
    type: 'ORDER_UPDATE',
    title: `Order Status: ${newStatus}`,
    message: `Your order #${order.id.substring(0, 8)} ${statusText}.`,
    relatedOrderId: order.id,
    emailRecipient: customerEmail,
    sendEmail: Boolean(customerEmail),
    dispatchGas: true,
    gasEventType: 'ORDER_STATUS_CHANGED',
    gasPayload: {
      orderId: order.id,
      previousStatus,
      newStatus,
    },
  });
};

/**
 * Helper: Trigger notifications for delivery status transitions
 */
const notifyDeliveryStatusChanged = async (deliveryRequest, options = {}) => {
  if (!deliveryRequest || !deliveryRequest.id) return null;

  const requesterId = deliveryRequest.requester_user_id || deliveryRequest.requesterUserId;
  const requesterEmail = options.requesterEmail || null;
  const status = deliveryRequest.status;

  return await safeNotify({
    userId: requesterId,
    type: 'DELIVERY_UPDATE',
    title: `Delivery Request: ${status}`,
    message: `Your delivery request #${deliveryRequest.id.substring(0, 8)} is now ${status.toLowerCase()}.`,
    relatedDeliveryRequestId: deliveryRequest.id,
    emailRecipient: requesterEmail,
    sendEmail: Boolean(requesterEmail),
    dispatchGas: true,
    gasEventType: 'DELIVERY_ASSIGNED',
    gasPayload: {
      deliveryRequestId: deliveryRequest.id,
      status,
      riderUserId: deliveryRequest.rider_user_id || deliveryRequest.riderUserId || null,
    },
  });
};

/**
 * Helper: Trigger notifications for service request updates
 */
const notifyServiceRequestUpdated = async (serviceRequest, options = {}) => {
  if (!serviceRequest || !serviceRequest.id) return null;

  const requesterId = serviceRequest.requester_user_id || serviceRequest.requesterUserId;
  const requesterEmail = options.requesterEmail || null;
  const status = serviceRequest.status;

  return await safeNotify({
    userId: requesterId,
    type: 'SERVICE_UPDATE',
    title: `Service Request: ${status}`,
    message: `Your service request #${serviceRequest.id.substring(0, 8)} is now ${status.toLowerCase()}.`,
    relatedServiceRequestId: serviceRequest.id,
    emailRecipient: requesterEmail,
    sendEmail: Boolean(requesterEmail),
    dispatchGas: true,
    gasEventType: 'SERVICE_REQUEST_CREATED',
    gasPayload: {
      serviceRequestId: serviceRequest.id,
      status,
      serviceId: serviceRequest.service_id || serviceRequest.serviceId,
    },
  });
};

/**
 * Helper: Trigger notifications for marketplace moderation
 */
const notifyMarketplaceListingModerated = async (listing, action, reason, options = {}) => {
  if (!listing || !listing.id) return null;

  const sellerId = listing.seller_user_id || listing.sellerUserId;
  const sellerEmail = options.sellerEmail || listing.seller_email || null;

  const actionMessages = {
    APPROVE: `Your listing "${listing.title}" has been approved and published to the campus marketplace.`,
    REJECT: `Your listing "${listing.title}" was rejected by campus moderators. Reason: ${reason || 'Does not meet campus guidelines'}.`,
    FLAG_SUSPENDED: `Your listing "${listing.title}" has been suspended for administrative review.`,
  };

  const message = actionMessages[action] || `Your listing "${listing.title}" status was updated.`;

  return await safeNotify({
    userId: sellerId,
    type: 'MARKETPLACE_UPDATE',
    title: `Marketplace Listing: ${action}`,
    message,
    emailRecipient: sellerEmail,
    sendEmail: Boolean(sellerEmail),
    dispatchGas: true,
    gasEventType: 'MARKETPLACE_LISTING_MODERATED',
    gasPayload: {
      listingId: listing.id,
      action,
      reason,
    },
  });
};

/**
 * Helper: System alert notification
 */
const notifySystemAlert = async (userId, title, message, options = {}) => {
  return await safeNotify({
    userId,
    type: 'SYSTEM',
    title: title || 'Campus Notice',
    message,
    emailRecipient: options.email || null,
    sendEmail: Boolean(options.email),
    dispatchGas: false,
  });
};

/**
 * Broadcast system notification (Administrative)
 */
const broadcastSystemNotification = async ({
  targetUserIds = [],
  title,
  message,
  adminUser,
}) => {
  if (!isUserAdmin(adminUser)) {
    throw new AppError(403, 'FORBIDDEN', 'Administrative privileges required to broadcast notifications');
  }

  if (!title || !message) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Title and message are required for broadcast');
  }

  const results = [];
  for (const userId of targetUserIds) {
    const res = await safeNotify({
      userId,
      type: 'SYSTEM',
      title,
      message,
    });
    results.push(res);
  }

  return {
    broadcastCount: results.length,
    successCount: results.filter((r) => r.notification !== null).length,
  };
};

module.exports = {
  getUserNotifications,
  getUnreadNotificationCount,
  getUserNotificationDetails,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteUserNotification,
  createAndDispatchNotification,
  safeNotify,
  notifyOrderCreated,
  notifyOrderStatusChanged,
  notifyDeliveryStatusChanged,
  notifyServiceRequestUpdated,
  notifyMarketplaceListingModerated,
  notifySystemAlert,
  broadcastSystemNotification,
  formatNotification,
  VALID_NOTIFICATION_TYPES,
};
