/**
 * Notification Repository
 * Data access layer for in-app notifications.
 * Enforces parameterized queries and explicit column selection.
 */

const database = require('../config/database');

const NOTIFICATION_COLUMNS = `
  n.id,
  n.user_id,
  n.type,
  n.title,
  n.message,
  n.related_order_id,
  n.related_service_request_id,
  n.related_delivery_request_id,
  n.is_read,
  n.read_at,
  n.created_at
`;

/**
 * Creates a new notification record
 */
const createNotification = async ({
  userId,
  type,
  title = null,
  message,
  relatedOrderId = null,
  relatedServiceRequestId = null,
  relatedDeliveryRequestId = null,
  isRead = false,
  readAt = null,
}, client = null) => {
  const db = client || database;
  const computedReadAt = isRead ? (readAt || new Date().toISOString()) : null;

  const query = `
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      related_order_id,
      related_service_request_id,
      related_delivery_request_id,
      is_read,
      read_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, user_id, type, title, message,
          related_order_id, related_service_request_id,
          related_delivery_request_id, is_read, read_at, created_at
  `;

  const values = [
    userId,
    type,
    title,
    message,
    relatedOrderId,
    relatedServiceRequestId,
    relatedDeliveryRequestId,
    Boolean(isRead),
    computedReadAt,
  ];

  const result = await db.query(query, values);
  return result.rows[0] || null;
};

/**
 * Retrieves notifications for a specific user with pagination and optional filters
 */
const getNotificationsByUser = async (userId, { limit = 20, offset = 0, isRead = null, type = null } = {}) => {
  const whereClauses = ['n.user_id = $1'];
  const values = [userId];
  let paramIdx = 2;

  if (typeof isRead === 'boolean') {
    whereClauses.push(`n.is_read = $${paramIdx}`);
    values.push(isRead);
    paramIdx += 1;
  }

  if (type) {
    whereClauses.push(`n.type = $${paramIdx}`);
    values.push(type);
    paramIdx += 1;
  }

  const query = `
    SELECT ${NOTIFICATION_COLUMNS}
      FROM public.notifications AS n
     WHERE ${whereClauses.join(' AND ')}
     ORDER BY n.created_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `;

  values.push(limit, offset);

  const result = await database.query(query, values);
  return result.rows || [];
};

/**
 * Retrieves total unread notification count for a user
 */
const getUnreadCountByUser = async (userId) => {
  const query = `
    SELECT COUNT(*)::int AS unread_count
      FROM public.notifications
     WHERE user_id = $1
       AND is_read = false
  `;
  const result = await database.query(query, [userId]);
  return result.rows[0] ? Number(result.rows[0].unread_count) : 0;
};

/**
 * Retrieves a single notification by ID, optionally enforcing user isolation
 */
const getNotificationById = async (id, userId = null) => {
  const whereClauses = ['n.id = $1'];
  const values = [id];

  if (userId) {
    whereClauses.push('n.user_id = $2');
    values.push(userId);
  }

  const query = `
    SELECT ${NOTIFICATION_COLUMNS}
      FROM public.notifications AS n
     WHERE ${whereClauses.join(' AND ')}
     LIMIT 1
  `;

  const result = await database.query(query, values);
  return result.rows[0] || null;
};

/**
 * Marks a single notification as read, enforcing user ownership and DB check constraint
 */
const markAsRead = async (notificationId, userId = null) => {
  const whereClauses = ['id = $1'];
  const values = [notificationId];

  if (userId) {
    whereClauses.push('user_id = $2');
    values.push(userId);
  }

  const query = `
    UPDATE public.notifications
       SET is_read = true,
           read_at = NOW()
     WHERE ${whereClauses.join(' AND ')}
    RETURNING id, user_id, type, title, message,
          related_order_id, related_service_request_id,
          related_delivery_request_id, is_read, read_at, created_at
  `;

  const result = await database.query(query, values);
  return result.rows[0] || null;
};

/**
 * Marks all unread notifications as read for a given user
 */
const markAllAsRead = async (userId) => {
  const query = `
    UPDATE public.notifications
       SET is_read = true,
           read_at = NOW()
     WHERE user_id = $1
       AND is_read = false
    RETURNING id
  `;

  const result = await database.query(query, [userId]);
  return {
    updatedCount: result.rowCount || 0,
    updatedIds: (result.rows || []).map((r) => r.id),
  };
};

/**
 * Deletes a notification by ID with ownership check
 */
const deleteNotification = async (notificationId, userId = null) => {
  const whereClauses = ['id = $1'];
  const values = [notificationId];

  if (userId) {
    whereClauses.push('user_id = $2');
    values.push(userId);
  }

  const query = `
    DELETE FROM public.notifications
     WHERE ${whereClauses.join(' AND ')}
    RETURNING id
  `;

  const result = await database.query(query, values);
  return result.rowCount > 0;
};

/**
 * Administrative query for notification auditing and monitoring
 */
const listAllNotificationsAdmin = async ({ limit = 20, offset = 0, userId = null, type = null, isRead = null } = {}) => {
  const whereClauses = [];
  const values = [];
  let paramIdx = 1;

  if (userId) {
    whereClauses.push(`n.user_id = $${paramIdx}`);
    values.push(userId);
    paramIdx += 1;
  }

  if (type) {
    whereClauses.push(`n.type = $${paramIdx}`);
    values.push(type);
    paramIdx += 1;
  }

  if (typeof isRead === 'boolean') {
    whereClauses.push(`n.is_read = $${paramIdx}`);
    values.push(isRead);
    paramIdx += 1;
  }

  const whereFragment = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const query = `
    SELECT ${NOTIFICATION_COLUMNS}
      FROM public.notifications AS n
      ${whereFragment}
     ORDER BY n.created_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `;

  values.push(limit, offset);

  const result = await database.query(query, values);
  return result.rows || [];
};

module.exports = {
  createNotification,
  getNotificationsByUser,
  getUnreadCountByUser,
  getNotificationById,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  listAllNotificationsAdmin,
};
