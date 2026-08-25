/**
 * Notification Routes
 * Exposes in-app notification endpoints and read/unread status management.
 */

const express = require('express');
const notificationController = require('../controllers/notificationController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// All notification operations require authentication
router.use(requireAuth);

// Read-all and unread count operations (defined before parameterized :notificationId)
router.get('/unread-count', notificationController.getUnreadCount);
router.get('/email-status', notificationController.getEmailStatus);
router.patch('/read-all', notificationController.markAllAsRead);
router.post('/read-all', notificationController.markAllAsRead);

// Administrative broadcast
router.post(
  '/broadcast',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  notificationController.adminBroadcast
);

// List notifications
router.get('/', notificationController.listNotifications);

// Individual notification operations
router.get('/:notificationId', notificationController.getNotification);
router.patch('/:notificationId/read', notificationController.markAsRead);
router.patch('/:notificationId', notificationController.markAsRead);
router.delete('/:notificationId', notificationController.deleteNotification);

module.exports = router;
