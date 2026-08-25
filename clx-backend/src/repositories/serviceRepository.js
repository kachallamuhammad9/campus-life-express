const database = require('../config/database');

const listServices = async ({
  campusId,
  categoryId,
  search,
  limit = 20,
  offset = 0,
} = {}) => {
  const conditions = [
    's.is_active = true',
    'c.is_active = true',
    '(v.id IS NULL OR v.status = \'ACTIVE\')',
  ];
  const params = [];

  if (campusId) {
    params.push(campusId);
    conditions.push(`(c.id::text = $${params.length} OR c.slug = $${params.length} OR c.legacy_key = $${params.length})`);
  }

  if (categoryId) {
    params.push(categoryId);
    conditions.push(`EXISTS (
      SELECT 1 FROM public.categories AS cat
      WHERE (cat.id = s.category_id OR cat.id = s.subcategory_id OR cat.parent_id = s.category_id)
        AND cat.is_active = true
        AND (cat.id::text = $${params.length} OR cat.slug = $${params.length} OR cat.legacy_key = $${params.length})
    )`);
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(s.name ILIKE $${params.length} OR s.description ILIKE $${params.length})`);
  }

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await database.query(
    `SELECT s.id, s.legacy_key, s.slug, s.provider_user_id, s.vendor_id,
            s.campus_id, s.category_id, s.subcategory_id, s.name,
            s.description, s.starting_price_kobo, s.price_type,
            s.image_url, s.turnaround_time, s.requires_file_upload,
            s.requires_appointment, s.is_active, s.created_at, s.updated_at,
            c.name AS campus_name, c.slug AS campus_slug,
            cat.name AS category_name, cat.slug AS category_slug,
            v.name AS vendor_name, v.slug AS vendor_slug
       FROM public.services AS s
       JOIN public.campuses AS c ON c.id = s.campus_id
       JOIN public.categories AS cat ON cat.id = s.category_id
       LEFT JOIN public.vendors AS v ON v.id = s.vendor_id
      ${whereClause}
      ORDER BY s.name ASC, s.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  return result.rows;
};

const getServiceByIdentifier = async (identifier) => {
  const result = await database.query(
    `SELECT s.id, s.legacy_key, s.slug, s.provider_user_id, s.vendor_id,
            s.campus_id, s.category_id, s.subcategory_id, s.name,
            s.description, s.starting_price_kobo, s.price_type,
            s.image_url, s.turnaround_time, s.requires_file_upload,
            s.requires_appointment, s.is_active, s.created_at, s.updated_at,
            c.name AS campus_name, c.slug AS campus_slug,
            cat.name AS category_name, cat.slug AS category_slug,
            v.name AS vendor_name, v.slug AS vendor_slug,
            prof.full_name AS provider_name
       FROM public.services AS s
       JOIN public.campuses AS c ON c.id = s.campus_id
       JOIN public.categories AS cat ON cat.id = s.category_id
       LEFT JOIN public.vendors AS v ON v.id = s.vendor_id
       LEFT JOIN public.profiles AS prof ON prof.id = s.provider_user_id
      WHERE s.is_active = true
        AND c.is_active = true
        AND (v.id IS NULL OR v.status = 'ACTIVE')
        AND (s.id::text = $1 OR s.slug = $1 OR s.legacy_key = $1)
      LIMIT 1`,
    [identifier]
  );

  return result.rows[0] || null;
};

const createServiceRequest = async ({
  serviceId,
  requesterUserId,
  providerUserId,
  vendorId,
  campusId,
  deliveryType,
  customerLocation,
  description,
  fileUrl,
  estimatedBudgetKobo,
  preferredDate,
  preferredTime,
  notes,
}) => {
  const result = await database.query(
    `INSERT INTO public.service_requests (
       service_id,
       requester_user_id,
       provider_user_id,
       vendor_id,
       campus_id,
       delivery_type,
       customer_location,
       description,
       file_url,
       estimated_budget_kobo,
       preferred_date,
       preferred_time,
       status,
       notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'SUBMITTED', $13)
     RETURNING id, service_id, requester_user_id, provider_user_id, vendor_id,
               campus_id, delivery_type, customer_location, description,
               file_url, estimated_budget_kobo, preferred_date, preferred_time,
               status, notes, created_at, updated_at, completed_at`,
    [
      serviceId,
      requesterUserId,
      providerUserId,
      vendorId || null,
      campusId,
      deliveryType,
      customerLocation || null,
      description,
      fileUrl || null,
      estimatedBudgetKobo || null,
      preferredDate || null,
      preferredTime || null,
      notes || null,
    ]
  );

  return result.rows[0];
};

const getServiceRequestById = async (requestId) => {
  const result = await database.query(
    `SELECT sr.id, sr.service_id, sr.requester_user_id, sr.provider_user_id,
            sr.vendor_id, sr.campus_id, sr.delivery_type, sr.customer_location,
            sr.description, sr.file_url, sr.estimated_budget_kobo,
            sr.preferred_date, sr.preferred_time, sr.status, sr.notes,
            sr.created_at, sr.updated_at, sr.completed_at,
            s.name AS service_name, s.slug AS service_slug,
            c.name AS campus_name, c.slug AS campus_slug,
            v.name AS vendor_name, v.slug AS vendor_slug,
            requester.full_name AS requester_name,
            provider.full_name AS provider_name
       FROM public.service_requests AS sr
       JOIN public.services AS s ON s.id = sr.service_id
       JOIN public.campuses AS c ON c.id = sr.campus_id
       LEFT JOIN public.vendors AS v ON v.id = sr.vendor_id
       LEFT JOIN public.profiles AS requester ON requester.id = sr.requester_user_id
       LEFT JOIN public.profiles AS provider ON provider.id = sr.provider_user_id
      WHERE sr.id::text = $1
      LIMIT 1`,
    [requestId]
  );

  return result.rows[0] || null;
};

module.exports = {
  listServices,
  getServiceByIdentifier,
  createServiceRequest,
  getServiceRequestById,
};
