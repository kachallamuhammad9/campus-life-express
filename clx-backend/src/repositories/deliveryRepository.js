const database = require('../config/database');

/**
 * Delivery Repository
 * Data access layer for campus delivery requests and errands.
 * Uses parameterized SQL and explicit column lists.
 */

const getExecutor = (client) => client || database;

/**
 * Creates a new delivery request
 */
const createDeliveryRequest = async ({
  requesterUserId,
  riderUserId = null,
  campusId,
  taskType,
  pickupLocation,
  dropoffLocation,
  description = null,
  estimatedFeeKobo = 40000,
  actualFeeKobo = null,
  urgency = null,
  preferredAt = null,
  status = 'REQUESTED',
  notes = null,
}, client = null) => {
  const executor = getExecutor(client);
  const result = await executor.query(
    `INSERT INTO public.delivery_requests (
       requester_user_id,
       rider_user_id,
       campus_id,
       task_type,
       pickup_location,
       dropoff_location,
       description,
       estimated_fee_kobo,
       actual_fee_kobo,
       urgency,
       preferred_at,
       status,
       notes
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id, requester_user_id, rider_user_id, campus_id, task_type,
               pickup_location, dropoff_location, description, estimated_fee_kobo,
               actual_fee_kobo, urgency, preferred_at, status, notes,
               created_at, updated_at, picked_up_at, delivered_at`,
    [
      requesterUserId,
      riderUserId,
      campusId,
      taskType,
      pickupLocation,
      dropoffLocation,
      description,
      estimatedFeeKobo,
      actualFeeKobo,
      urgency,
      preferredAt,
      status,
      notes,
    ]
  );

  return result.rows[0];
};

/**
 * Retrieves a delivery request by ID with campus, requester, and rider details
 */
const getDeliveryRequestById = async (deliveryId, client = null) => {
  const executor = getExecutor(client);
  const result = await executor.query(
    `SELECT dr.id, dr.requester_user_id, dr.rider_user_id, dr.campus_id, dr.task_type,
            dr.pickup_location, dr.dropoff_location, dr.description, dr.estimated_fee_kobo,
            dr.actual_fee_kobo, dr.urgency, dr.preferred_at, dr.status, dr.notes,
            dr.created_at, dr.updated_at, dr.picked_up_at, dr.delivered_at,
            camp.name AS campus_name, camp.slug AS campus_slug,
            req.full_name AS requester_name, req.phone_number AS requester_phone, req.email AS requester_email,
            rdr.full_name AS rider_name, rdr.phone_number AS rider_phone, rdr.email AS rider_email
       FROM public.delivery_requests AS dr
       JOIN public.campuses AS camp ON camp.id = dr.campus_id
       JOIN public.profiles AS req ON req.id = dr.requester_user_id
  LEFT JOIN public.profiles AS rdr ON rdr.id = dr.rider_user_id
      WHERE dr.id = $1
      LIMIT 1`,
    [deliveryId]
  );

  return result.rows[0] || null;
};

/**
 * Retrieves delivery requests created by a specific requester (customer)
 */
const getDeliveryRequestsByRequesterId = async (
  requesterUserId,
  { status = null, limit = 20, offset = 0 } = {},
  client = null
) => {
  const executor = getExecutor(client);
  const result = await executor.query(
    `SELECT dr.id, dr.requester_user_id, dr.rider_user_id, dr.campus_id, dr.task_type,
            dr.pickup_location, dr.dropoff_location, dr.description, dr.estimated_fee_kobo,
            dr.actual_fee_kobo, dr.urgency, dr.preferred_at, dr.status, dr.notes,
            dr.created_at, dr.updated_at, dr.picked_up_at, dr.delivered_at,
            camp.name AS campus_name, camp.slug AS campus_slug,
            req.full_name AS requester_name, req.phone_number AS requester_phone, req.email AS requester_email,
            rdr.full_name AS rider_name, rdr.phone_number AS rider_phone, rdr.email AS rider_email
       FROM public.delivery_requests AS dr
       JOIN public.campuses AS camp ON camp.id = dr.campus_id
       JOIN public.profiles AS req ON req.id = dr.requester_user_id
  LEFT JOIN public.profiles AS rdr ON rdr.id = dr.rider_user_id
      WHERE dr.requester_user_id = $1
        AND ($2::text IS NULL OR dr.status::text = $2)
      ORDER BY dr.created_at DESC
      LIMIT $3 OFFSET $4`,
    [requesterUserId, status, limit, offset]
  );

  return result.rows;
};

/**
 * Retrieves deliveries assigned to a specific rider
 */
const getAssignedDeliveriesForRider = async (
  riderUserId,
  { status = null, limit = 20, offset = 0 } = {},
  client = null
) => {
  const executor = getExecutor(client);
  const result = await executor.query(
    `SELECT dr.id, dr.requester_user_id, dr.rider_user_id, dr.campus_id, dr.task_type,
            dr.pickup_location, dr.dropoff_location, dr.description, dr.estimated_fee_kobo,
            dr.actual_fee_kobo, dr.urgency, dr.preferred_at, dr.status, dr.notes,
            dr.created_at, dr.updated_at, dr.picked_up_at, dr.delivered_at,
            camp.name AS campus_name, camp.slug AS campus_slug,
            req.full_name AS requester_name, req.phone_number AS requester_phone, req.email AS requester_email,
            rdr.full_name AS rider_name, rdr.phone_number AS rider_phone, rdr.email AS rider_email
       FROM public.delivery_requests AS dr
       JOIN public.campuses AS camp ON camp.id = dr.campus_id
       JOIN public.profiles AS req ON req.id = dr.requester_user_id
  LEFT JOIN public.profiles AS rdr ON rdr.id = dr.rider_user_id
      WHERE dr.rider_user_id = $1
        AND ($2::text IS NULL OR dr.status::text = $2)
      ORDER BY dr.created_at DESC
      LIMIT $3 OFFSET $4`,
    [riderUserId, status, limit, offset]
  );

  return result.rows;
};

/**
 * Retrieves unassigned delivery requests available for riders in a campus
 */
const getAvailableDeliveriesForCampus = async (
  campusId = null,
  { limit = 20, offset = 0 } = {},
  client = null
) => {
  const executor = getExecutor(client);
  const result = await executor.query(
    `SELECT dr.id, dr.requester_user_id, dr.rider_user_id, dr.campus_id, dr.task_type,
            dr.pickup_location, dr.dropoff_location, dr.description, dr.estimated_fee_kobo,
            dr.actual_fee_kobo, dr.urgency, dr.preferred_at, dr.status, dr.notes,
            dr.created_at, dr.updated_at, dr.picked_up_at, dr.delivered_at,
            camp.name AS campus_name, camp.slug AS campus_slug,
            req.full_name AS requester_name, req.phone_number AS requester_phone, req.email AS requester_email,
            rdr.full_name AS rider_name, rdr.phone_number AS rider_phone, rdr.email AS rider_email
       FROM public.delivery_requests AS dr
       JOIN public.campuses AS camp ON camp.id = dr.campus_id
       JOIN public.profiles AS req ON req.id = dr.requester_user_id
  LEFT JOIN public.profiles AS rdr ON rdr.id = dr.rider_user_id
      WHERE dr.status = 'REQUESTED'
        AND dr.rider_user_id IS NULL
        AND ($1::text IS NULL OR dr.campus_id::text = $1)
      ORDER BY dr.created_at DESC
      LIMIT $2 OFFSET $3`,
    [campusId, limit, offset]
  );

  return result.rows;
};

/**
 * Assigns a rider to a delivery request and updates status to ACCEPTED
 */
const assignRiderToDelivery = async (deliveryId, riderUserId, client = null) => {
  const executor = getExecutor(client);
  const result = await executor.query(
    `UPDATE public.delivery_requests
        SET rider_user_id = $2,
            status = 'ACCEPTED',
            updated_at = now()
      WHERE id = $1
      RETURNING id, requester_user_id, rider_user_id, campus_id, task_type,
                pickup_location, dropoff_location, description, estimated_fee_kobo,
                actual_fee_kobo, urgency, preferred_at, status, notes,
                created_at, updated_at, picked_up_at, delivered_at`,
    [deliveryId, riderUserId]
  );

  return result.rows[0] || null;
};

/**
 * Updates delivery request status with timestamp guards
 */
const updateDeliveryStatus = async (
  deliveryId,
  status,
  { actualFeeKobo = null, notes = null } = {},
  client = null
) => {
  const executor = getExecutor(client);
  const result = await executor.query(
    `UPDATE public.delivery_requests
        SET status = $2::delivery_status,
            actual_fee_kobo = COALESCE($3, actual_fee_kobo),
            notes = COALESCE($4, notes),
            updated_at = now(),
            picked_up_at = CASE WHEN $2::text = 'PICKED_UP' THEN COALESCE(picked_up_at, now()) ELSE picked_up_at END,
            delivered_at = CASE WHEN $2::text = 'DELIVERED' THEN COALESCE(delivered_at, now()) ELSE delivered_at END
      WHERE id = $1
      RETURNING id, requester_user_id, rider_user_id, campus_id, task_type,
                pickup_location, dropoff_location, description, estimated_fee_kobo,
                actual_fee_kobo, urgency, preferred_at, status, notes,
                created_at, updated_at, picked_up_at, delivered_at`,
    [deliveryId, status, actualFeeKobo, notes]
  );

  return result.rows[0] || null;
};

/**
 * Retrieves delivery zone by ID
 */
const getDeliveryZoneById = async (zoneId, client = null) => {
  const executor = getExecutor(client);
  const result = await executor.query(
    `SELECT dz.id, dz.campus_id, dz.name, dz.description,
            dz.base_delivery_fee_kobo, dz.is_active, dz.created_at, dz.updated_at
       FROM public.delivery_zones AS dz
      WHERE dz.id = $1
      LIMIT 1`,
    [zoneId]
  );

  return result.rows[0] || null;
};

module.exports = {
  createDeliveryRequest,
  getDeliveryRequestById,
  getDeliveryRequestsByRequesterId,
  getAssignedDeliveriesForRider,
  getAvailableDeliveriesForCampus,
  assignRiderToDelivery,
  updateDeliveryStatus,
  getDeliveryZoneById,
};
