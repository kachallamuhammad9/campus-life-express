/**
 * Notification Controller
 * Handles HTTP transport for in-app and email notifications.
 */

const notificationService = require('../services/notificationService');
const emailProvider = require('../utils/emailProvider');
const { sendSuccess } = require('../utils/response');

/**
 * GET /api/v1/notifications
 * List notifications for the authenticated user with pagination and filter support
 */
const listNotifications = async (req, res, next) => {
  try {
    const result = await notificationService.getUserNotifications(req.user, req.query);
    return sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/notifications/unread-count
 * Quick query for current unread count badge
 */
const getUnreadCount = async (req, res, next) => {
  try {
    const result = await notificationService.getUnreadNotificationCount(req.user);
    return sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/notifications/:notificationId
 * Retrieve a specific notification by ID
 */
const getNotification = async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const result = await notificationService.getUserNotificationDetails(req.user, notificationId);
    return sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/notifications/:notificationId/read
 * Mark a single notification as read
 */
const markAsRead = async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const result = await notificationService.markNotificationAsRead(req.user, notificationId);
    return sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/notifications/read-all
 * Mark all unread notifications for user as read
 */
const markAllAsRead = async (req, res, next) => {
  try {
    const result = await notificationService.markAllNotificationsAsRead(req.user);
    return sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/v1/notifications/:notificationId
 * Delete a notification
 */
const deleteNotification = async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const result = await notificationService.deleteUserNotification(req.user, notificationId);
    return sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/notifications/broadcast (Admin only)
 * Broadcast system notice to target user IDs
 */
const adminBroadcast = async (req, res, next) => {
  try {
    const { targetUserIds, title, message } = req.body || {};
    const result = await notificationService.broadcastSystemNotification({
      targetUserIds,
      title,
      message,
      adminUser: req.user,
    });
    return sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/notifications/email-status
 * Diagnostics endpoint for email provider status
 */
const getEmailStatus = async (req, res, next) => {
  try {
    const status = emailProvider.getEmailProviderStatus();
    return sendSuccess(res, status, 200);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listNotifications,
  getUnreadCount,
  getNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  adminBroadcast,
  getEmailStatus,
};
