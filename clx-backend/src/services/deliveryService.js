const deliveryRepository = require('../repositories/deliveryRepository');
const campusRepository = require('../repositories/campusRepository');
const notificationService = require('./notificationService');
const { AppError } = require('../utils/AppError');

/**
 * Delivery Service
 * Encapsulates business logic, status transitions, fee calculations,
 * ownership enforcement, and role-based access for campus deliveries and errands.
 */

const VALID_TASK_TYPES = new Set(['DELIVERY', 'VENDOR_PICKUP', 'ERRAND']);
const VALID_DELIVERY_STATUSES = new Set([
  'REQUESTED',
  'ACCEPTED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED',
]);

const ALLOWED_TRANSITIONS = {
  REQUESTED: new Set(['ACCEPTED', 'CANCELLED']),
  ACCEPTED: new Set(['PICKED_UP', 'CANCELLED']),
  PICKED_UP: new Set(['IN_TRANSIT', 'DELIVERED', 'CANCELLED']),
  IN_TRANSIT: new Set(['DELIVERED', 'CANCELLED']),
  DELIVERED: new Set(),
  CANCELLED: new Set(),
};

const DEFAULT_BASE_DELIVERY_FEE_KOBO = 40000; // 400 NGN

/**
 * Safe pagination normalizer
 */
const normalizePagination = (rawLimit, rawOffset) => {
  let limit = Number.parseInt(rawLimit, 10);
  if (Number.isNaN(limit) || limit < 1) {
    limit = 20;
  }
  if (limit > 100) {
    limit = 100;
  }

  let offset = Number.parseInt(rawOffset, 10);
  if (Number.isNaN(offset) || offset < 0) {
    offset = 0;
  }

  return { limit, offset };
};

/**
 * Formats delivery request record into standard API response model
 */
const formatDeliveryRequest = (dr) => {
  if (!dr) return null;

  return {
    id: dr.id,
    requesterUserId: dr.requester_user_id || dr.requesterUserId,
    riderUserId: dr.rider_user_id || dr.riderUserId || null,
    campusId: dr.campus_id || dr.campusId,
    taskType: dr.task_type || dr.taskType,
    pickupLocation: dr.pickup_location || dr.pickupLocation,
    dropoffLocation: dr.dropoff_location || dr.dropoffLocation,
    description: dr.description || null,
    estimatedFeeKobo: Number(
      dr.estimated_fee_kobo !== undefined && dr.estimated_fee_kobo !== null
        ? dr.estimated_fee_kobo
        : (dr.estimatedFeeKobo || 0)
    ),
    actualFeeKobo:
      dr.actual_fee_kobo !== undefined && dr.actual_fee_kobo !== null
        ? Number(dr.actual_fee_kobo)
        : (dr.actualFeeKobo !== undefined && dr.actualFeeKobo !== null ? Number(dr.actualFeeKobo) : null),
    urgency: dr.urgency || null,
    preferredAt: dr.preferred_at || dr.preferredAt || null,
    status: dr.status,
    notes: dr.notes || null,
    pickedUpAt: dr.picked_up_at || dr.pickedUpAt || null,
    deliveredAt: dr.delivered_at || dr.deliveredAt || null,
    createdAt: dr.created_at || dr.createdAt || null,
    updatedAt: dr.updated_at || dr.updatedAt || null,
    campus: (dr.campus_name || (dr.campus && dr.campus.name))
      ? {
          id: dr.campus_id || (dr.campus && dr.campus.id),
          name: dr.campus_name || (dr.campus && dr.campus.name),
          slug: dr.campus_slug || (dr.campus && dr.campus.slug),
        }
      : null,
    requester: (dr.requester_name || (dr.requester && dr.requester.name))
      ? {
          id: dr.requester_user_id || (dr.requester && dr.requester.id),
          name: dr.requester_name || (dr.requester && dr.requester.name),
          phone: dr.requester_phone || (dr.requester && dr.requester.phone) || null,
          email: dr.requester_email || (dr.requester && dr.requester.email) || null,
        }
      : null,
    rider: (dr.rider_name || (dr.rider && dr.rider.name) || dr.rider_user_id)
      ? {
          id: dr.rider_user_id || (dr.rider && dr.rider.id),
          name: dr.rider_name || (dr.rider && dr.rider.name) || null,
          phone: dr.rider_phone || (dr.rider && dr.rider.phone) || null,
          email: dr.rider_email || (dr.rider && dr.rider.email) || null,
        }
      : null,
  };
};

/**
 * Creates a new delivery request
 */
const createDelivery = async (userId, payload = {}) => {
  if (!userId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  }

  const {
    campusId: rawCampusId,
    campus_id: snakeCampusId,
    taskType: rawTaskType,
    task_type: snakeTaskType,
    pickupLocation: rawPickup,
    pickup_location: snakePickup,
    dropoffLocation: rawDropoff,
    dropoff_location: snakeDropoff,
    description,
    deliveryZoneId: rawZoneId,
    delivery_zone_id: snakeZoneId,
    urgency,
    preferredAt: rawPreferredAt,
    preferred_at: snakePreferredAt,
    notes,
  } = payload;

  const campusIdentifier = rawCampusId || snakeCampusId;
  if (!campusIdentifier || typeof campusIdentifier !== 'string' || !campusIdentifier.trim()) {
    throw new AppError(400, 'INVALID_CAMPUS', 'Valid active campus ID is required');
  }

  const campus = await campusRepository.getCampusByIdentifier(campusIdentifier.trim());
  if (!campus || !campus.is_active) {
    throw new AppError(400, 'INVALID_CAMPUS', 'Campus was not found or is inactive');
  }

  const taskType = (rawTaskType || snakeTaskType || '').trim().toUpperCase();
  if (!taskType || !VALID_TASK_TYPES.has(taskType)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Valid task_type is required (DELIVERY, VENDOR_PICKUP, ERRAND)'
    );
  }

  const pickupLocation = (rawPickup || snakePickup || '').trim();
  if (!pickupLocation) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Pickup location is required');
  }

  const dropoffLocation = (rawDropoff || snakeDropoff || '').trim();
  if (!dropoffLocation) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Dropoff location is required');
  }

  // Authoritative delivery fee calculation
  let estimatedFeeKobo = DEFAULT_BASE_DELIVERY_FEE_KOBO;
  const zoneId = rawZoneId || snakeZoneId;
  if (zoneId) {
    const zoneRecord = await deliveryRepository.getDeliveryZoneById(zoneId);
    if (!zoneRecord || zoneRecord.campus_id !== campus.id || !zoneRecord.is_active) {
      throw new AppError(
        400,
        'INVALID_DELIVERY_ZONE',
        'Specified delivery zone is invalid or inactive for this campus'
      );
    }
    estimatedFeeKobo = Number(zoneRecord.base_delivery_fee_kobo || DEFAULT_BASE_DELIVERY_FEE_KOBO);
  }

  const preferredAt = rawPreferredAt || snakePreferredAt || null;

  const createdRecord = await deliveryRepository.createDeliveryRequest({
    requesterUserId: userId,
    riderUserId: null,
    campusId: campus.id,
    taskType,
    pickupLocation,
    dropoffLocation,
    description: typeof description === 'string' && description.trim() ? description.trim() : null,
    estimatedFeeKobo,
    actualFeeKobo: null,
    urgency: typeof urgency === 'string' && urgency.trim() ? urgency.trim().toUpperCase() : null,
    preferredAt,
    status: 'REQUESTED',
    notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
  });

  const fullRecord = await deliveryRepository.getDeliveryRequestById(createdRecord.id);

  return {
    delivery: formatDeliveryRequest(fullRecord || createdRecord),
  };
};

/**
 * Retrieves delivery requests created by the authenticated customer
 */
const getCustomerDeliveries = async (userId, query = {}) => {
  if (!userId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  }

  const { limit, offset } = normalizePagination(query.limit, query.offset);
  let statusFilter = null;
  if (query.status && typeof query.status === 'string') {
    const upperStatus = query.status.trim().toUpperCase();
    if (VALID_DELIVERY_STATUSES.has(upperStatus)) {
      statusFilter = upperStatus;
    }
  }

  const records = await deliveryRepository.getDeliveryRequestsByRequesterId(userId, {
    status: statusFilter,
    limit,
    offset,
  });

  return {
    deliveries: (records || []).map(formatDeliveryRequest),
    pagination: {
      limit,
      offset,
      count: records ? records.length : 0,
    },
  };
};

/**
 * Retrieves delivery requests assigned to the authenticated rider
 */
const getRiderAssignedDeliveries = async (riderUserId, query = {}) => {
  if (!riderUserId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  }

  const { limit, offset } = normalizePagination(query.limit, query.offset);
  let statusFilter = null;
  if (query.status && typeof query.status === 'string') {
    const upperStatus = query.status.trim().toUpperCase();
    if (VALID_DELIVERY_STATUSES.has(upperStatus)) {
      statusFilter = upperStatus;
    }
  }

  const records = await deliveryRepository.getAssignedDeliveriesForRider(riderUserId, {
    status: statusFilter,
    limit,
    offset,
  });

  return {
    deliveries: (records || []).map(formatDeliveryRequest),
    pagination: {
      limit,
      offset,
      count: records ? records.length : 0,
    },
  };
};

/**
 * Retrieves unassigned delivery requests available in a campus
 */
const getAvailableDeliveries = async (campusId = null, query = {}) => {
  const { limit, offset } = normalizePagination(query.limit, query.offset);
  const records = await deliveryRepository.getAvailableDeliveriesForCampus(campusId, {
    limit,
    offset,
  });

  return {
    deliveries: (records || []).map(formatDeliveryRequest),
    pagination: {
      limit,
      offset,
      count: records ? records.length : 0,
    },
  };
};

/**
 * Retrieves single delivery request details with authorization checks
 */
const getDeliveryDetails = async (userId, userRoles = [], deliveryId) => {
  if (!userId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  }

  if (!deliveryId || typeof deliveryId !== 'string' || !deliveryId.trim()) {
    throw new AppError(400, 'INVALID_DELIVERY_ID', 'Delivery ID is required');
  }

  const delivery = await deliveryRepository.getDeliveryRequestById(deliveryId.trim());
  if (!delivery) {
    throw new AppError(404, 'DELIVERY_NOT_FOUND', 'Delivery request was not found');
  }

  const roles = Array.isArray(userRoles) ? userRoles.map((r) => String(r).toUpperCase()) : [];
  const isAdmin = roles.includes('ADMIN') || roles.includes('SUPER_ADMIN');
  const isRequester = delivery.requester_user_id === userId;
  const isAssignedRider = delivery.rider_user_id === userId;
  const isRiderViewingAvailable = roles.includes('RIDER') && delivery.status === 'REQUESTED' && !delivery.rider_user_id;

  if (!isAdmin && !isRequester && !isAssignedRider && !isRiderViewingAvailable) {
    throw new AppError(404, 'DELIVERY_NOT_FOUND', 'Delivery request was not found');
  }

  return {
    delivery: formatDeliveryRequest(delivery),
  };
};

/**
 * Allows an authenticated rider to accept an unassigned delivery request
 */
const acceptDelivery = async (riderUserId, userRoles = [], deliveryId) => {
  if (!riderUserId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  }

  if (!deliveryId || typeof deliveryId !== 'string' || !deliveryId.trim()) {
    throw new AppError(400, 'INVALID_DELIVERY_ID', 'Delivery ID is required');
  }

  const roles = Array.isArray(userRoles) ? userRoles.map((r) => String(r).toUpperCase()) : [];
  const isRiderOrAdmin = roles.includes('RIDER') || roles.includes('ADMIN') || roles.includes('SUPER_ADMIN');
  if (!isRiderOrAdmin) {
    throw new AppError(403, 'FORBIDDEN', 'Only riders or administrators can accept deliveries');
  }

  const delivery = await deliveryRepository.getDeliveryRequestById(deliveryId.trim());
  if (!delivery) {
    throw new AppError(404, 'DELIVERY_NOT_FOUND', 'Delivery request was not found');
  }

  if (delivery.status !== 'REQUESTED' || delivery.rider_user_id) {
    throw new AppError(
      400,
      'DELIVERY_ALREADY_ASSIGNED',
      'Delivery request is not available for acceptance'
    );
  }

  await deliveryRepository.assignRiderToDelivery(delivery.id, riderUserId);
  const updatedDelivery = await deliveryRepository.getDeliveryRequestById(delivery.id);

  return {
    delivery: formatDeliveryRequest(updatedDelivery),
  };
};

/**
 * Updates delivery status according to state machine rules and role permissions
 */
const updateDeliveryStatus = async (
  userId,
  userRoles = [],
  deliveryId,
  newStatus,
  options = {}
) => {
  if (!userId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  }

  if (!deliveryId || typeof deliveryId !== 'string' || !deliveryId.trim()) {
    throw new AppError(400, 'INVALID_DELIVERY_ID', 'Delivery ID is required');
  }

  const targetStatus = (newStatus || '').trim().toUpperCase();
  if (!targetStatus || !VALID_DELIVERY_STATUSES.has(targetStatus)) {
    throw new AppError(
      400,
      'INVALID_STATUS',
      'Valid status is required (REQUESTED, ACCEPTED, PICKED_UP, IN_TRANSIT, DELIVERED, CANCELLED)'
    );
  }

  const delivery = await deliveryRepository.getDeliveryRequestById(deliveryId.trim());
  if (!delivery) {
    throw new AppError(404, 'DELIVERY_NOT_FOUND', 'Delivery request was not found');
  }

  const roles = Array.isArray(userRoles) ? userRoles.map((r) => String(r).toUpperCase()) : [];
  const isAdmin = roles.includes('ADMIN') || roles.includes('SUPER_ADMIN');
  const isRequester = delivery.requester_user_id === userId;
  const isAssignedRider = delivery.rider_user_id === userId;

  if (!isAdmin && !isRequester && !isAssignedRider) {
    throw new AppError(404, 'DELIVERY_NOT_FOUND', 'Delivery request was not found');
  }

  const currentStatus = delivery.status;

  // Validate state machine transition
  const allowedNext = ALLOWED_TRANSITIONS[currentStatus] || new Set();
  if (!allowedNext.has(targetStatus)) {
    throw new AppError(
      400,
      'INVALID_STATUS_TRANSITION',
      `Cannot transition delivery from ${currentStatus} to ${targetStatus}`
    );
  }

  // Validate role-specific authority for transition
  if (!isAdmin) {
    if (isRequester) {
      if (targetStatus !== 'CANCELLED') {
        throw new AppError(
          403,
          'FORBIDDEN',
          'Customers are only authorized to cancel their delivery requests'
        );
      }
      if (currentStatus === 'PICKED_UP' || currentStatus === 'IN_TRANSIT') {
        throw new AppError(
          400,
          'CANNOT_CANCEL_IN_TRANSIT',
          'Delivery cannot be cancelled once picked up or in transit'
        );
      }
    } else if (isAssignedRider) {
      if (targetStatus === 'REQUESTED') {
        throw new AppError(
          400,
          'INVALID_STATUS_TRANSITION',
          'Cannot revert delivery status to REQUESTED'
        );
      }
    }
  }

  let actualFeeKobo = null;
  if (options.actualFeeKobo !== undefined && options.actualFeeKobo !== null) {
    const parsedFee = Number(options.actualFeeKobo);
    if (!Number.isNaN(parsedFee) && parsedFee >= 0) {
      actualFeeKobo = parsedFee;
    }
  } else if (targetStatus === 'DELIVERED' && !delivery.actual_fee_kobo) {
    // If not explicitly provided, actual fee matches estimated fee upon successful delivery
    actualFeeKobo = delivery.estimated_fee_kobo;
  }

  const notes = typeof options.notes === 'string' && options.notes.trim() ? options.notes.trim() : null;

  await deliveryRepository.updateDeliveryStatus(delivery.id, targetStatus, {
    actualFeeKobo,
    notes,
  });

  const updatedDelivery = await deliveryRepository.getDeliveryRequestById(delivery.id);

  if (updatedDelivery) {
    notificationService.notifyDeliveryStatusChanged(updatedDelivery).catch((err) => {
      console.warn('[DeliveryService] Non-fatal notification error:', err.message);
    });
  }

  return {
    delivery: formatDeliveryRequest(updatedDelivery),
  };
};

module.exports = {
  VALID_TASK_TYPES,
  VALID_DELIVERY_STATUSES,
  ALLOWED_TRANSITIONS,
  DEFAULT_BASE_DELIVERY_FEE_KOBO,
  normalizePagination,
  formatDeliveryRequest,
  createDelivery,
  getCustomerDeliveries,
  getRiderAssignedDeliveries,
  getAvailableDeliveries,
  getDeliveryDetails,
  acceptDelivery,
  updateDeliveryStatus,
};
