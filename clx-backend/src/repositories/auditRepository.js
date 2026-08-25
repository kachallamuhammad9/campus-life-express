/**
 * Audit Repository
 * Handles direct database access for audit logs
 */

const database = require('../config/database');

/**
 * Creates an audit log entry
 */
const createAuditLog = async ({
  actorUserId = null,
  action,
  resourceType,
  resourceId = null,
  changes = null,
  ipAddress = null,
  userAgent = null,
}) => {
  const result = await database.query(
    `INSERT INTO public.audit_logs (
      actor_user_id,
      action,
      resource_type,
      resource_id,
      changes,
      ip_address,
      user_agent,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    RETURNING id,
              actor_user_id,
              action,
              resource_type,
              resource_id,
              changes,
              ip_address,
              user_agent,
              created_at`,
    [
      actorUserId || null,
      action,
      resourceType,
      resourceId || null,
      changes ? JSON.stringify(changes) : null,
      ipAddress || null,
      userAgent ? String(userAgent).substring(0, 500) : null,
    ]
  );

  return result.rows[0];
};

/**
 * Lists audit logs with pagination and filters
 */
const listAuditLogs = async ({
  actorUserId,
  resourceType,
  resourceId,
  action,
  startDate,
  endDate,
  limit = 20,
  offset = 0,
} = {}) => {
  const conditions = [];
  const params = [];

  if (actorUserId) {
    params.push(actorUserId);
    conditions.push(`a.actor_user_id = $${params.length}`);
  }

  if (resourceType) {
    params.push(resourceType.toUpperCase());
    conditions.push(`UPPER(a.resource_type) = $${params.length}`);
  }

  if (resourceId) {
    params.push(resourceId);
    conditions.push(`a.resource_id = $${params.length}`);
  }

  if (action) {
    params.push(`%${action.trim().toUpperCase()}%`);
    conditions.push(`UPPER(a.action) LIKE $${params.length}`);
  }

  if (startDate) {
    params.push(startDate);
    conditions.push(`a.created_at >= $${params.length}`);
  }

  if (endDate) {
    params.push(endDate);
    conditions.push(`a.created_at <= $${params.length}`);
  }

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await database.query(
    `SELECT a.id,
            a.actor_user_id,
            a.action,
            a.resource_type,
            a.resource_id,
            a.changes,
            a.ip_address,
            a.user_agent,
            a.created_at,
            p.full_name AS actor_name,
            p.email AS actor_email
       FROM public.audit_logs AS a
  LEFT JOIN public.profiles AS p ON p.id = a.actor_user_id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  return result.rows;
};

/**
 * Counts total audit logs matching filters
 */
const countAuditLogs = async ({
  actorUserId,
  resourceType,
  resourceId,
  action,
  startDate,
  endDate,
} = {}) => {
  const conditions = [];
  const params = [];

  if (actorUserId) {
    params.push(actorUserId);
    conditions.push(`a.actor_user_id = $${params.length}`);
  }

  if (resourceType) {
    params.push(resourceType.toUpperCase());
    conditions.push(`UPPER(a.resource_type) = $${params.length}`);
  }

  if (resourceId) {
    params.push(resourceId);
    conditions.push(`a.resource_id = $${params.length}`);
  }

  if (action) {
    params.push(`%${action.trim().toUpperCase()}%`);
    conditions.push(`UPPER(a.action) LIKE $${params.length}`);
  }

  if (startDate) {
    params.push(startDate);
    conditions.push(`a.created_at >= $${params.length}`);
  }

  if (endDate) {
    params.push(endDate);
    conditions.push(`a.created_at <= $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await database.query(
    `SELECT COUNT(*)::integer AS count
       FROM public.audit_logs AS a
      ${whereClause}`,
    params
  );

  return result.rows[0] ? result.rows[0].count : 0;
};

/**
 * Retrieves a single audit log entry by ID
 */
const getAuditLogById = async (id) => {
  const result = await database.query(
    `SELECT a.id,
            a.actor_user_id,
            a.action,
            a.resource_type,
            a.resource_id,
            a.changes,
            a.ip_address,
            a.user_agent,
            a.created_at,
            p.full_name AS actor_name,
            p.email AS actor_email
       FROM public.audit_logs AS a
  LEFT JOIN public.profiles AS p ON p.id = a.actor_user_id
      WHERE a.id = $1
      LIMIT 1`,
    [id]
  );

  return result.rows[0] || null;
};

module.exports = {
  createAuditLog,
  listAuditLogs,
  countAuditLogs,
  getAuditLogById,
};
