const database = require('../config/database');

/**
 * Google Apps Script Integration Repository
 * Data access layer for administrative reports, data exports, analytics, and backups.
 * Strictly uses parameterized SQL and explicit column projections (no SELECT *).
 */

const getExecutor = (client) => client || database;

/**
 * Retrieve aggregated sales and financial metrics
 */
const getSalesReport = async (
  { startDate = null, endDate = null, campusId = null } = {},
  client = null
) => {
  const executor = getExecutor(client);
  const conditions = [];
  const params = [];

  if (startDate) {
    params.push(startDate);
    conditions.push(`o.created_at >= $${params.length}`);
  }
  if (endDate) {
    params.push(endDate);
    conditions.push(`o.created_at <= $${params.length}`);
  }
  if (campusId) {
    params.push(campusId);
    conditions.push(
      `(o.campus_id::text = $${params.length} OR c.slug = $${params.length} OR c.legacy_key = $${params.length})`
    );
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // 1. Overall Summary
  const summaryQuery = `
    SELECT
      COUNT(*)::integer AS total_orders,
      COUNT(*) FILTER (WHERE o.status = 'DELIVERED')::integer AS delivered_orders,
      COUNT(*) FILTER (WHERE o.status = 'CANCELLED')::integer AS cancelled_orders,
      COUNT(*) FILTER (WHERE o.status = 'PENDING')::integer AS pending_orders,
      COUNT(*) FILTER (WHERE o.status = 'CONFIRMED')::integer AS confirmed_orders,
      COUNT(*) FILTER (WHERE o.payment_status = 'PAID')::integer AS paid_orders,
      COUNT(*) FILTER (WHERE o.payment_status = 'PENDING')::integer AS pending_payment_orders,
      COALESCE(SUM(o.total_kobo), 0)::bigint AS total_gmv_kobo,
      COALESCE(SUM(o.total_kobo) FILTER (WHERE o.payment_status = 'PAID'), 0)::bigint AS total_paid_revenue_kobo,
      COALESCE(SUM(o.delivery_fee_kobo), 0)::bigint AS total_delivery_fees_kobo,
      COALESCE(SUM(o.service_fee_kobo), 0)::bigint AS total_service_fees_kobo,
      COALESCE(AVG(o.total_kobo), 0)::bigint AS avg_order_value_kobo
    FROM public.orders AS o
    LEFT JOIN public.campuses AS c ON c.id = o.campus_id
    ${whereClause}
  `;

  // 2. Breakdown by Payment Method
  const paymentMethodQuery = `
    SELECT
      o.payment_method,
      COUNT(*)::integer AS order_count,
      COALESCE(SUM(o.total_kobo), 0)::bigint AS total_kobo
    FROM public.orders AS o
    LEFT JOIN public.campuses AS c ON c.id = o.campus_id
    ${whereClause}
    GROUP BY o.payment_method
    ORDER BY order_count DESC
  `;

  // 3. Breakdown by Order Status
  const orderStatusQuery = `
    SELECT
      o.status AS order_status,
      COUNT(*)::integer AS order_count,
      COALESCE(SUM(o.total_kobo), 0)::bigint AS total_kobo
    FROM public.orders AS o
    LEFT JOIN public.campuses AS c ON c.id = o.campus_id
    ${whereClause}
    GROUP BY o.status
    ORDER BY order_count DESC
  `;

  // 4. Breakdown by Campus
  const campusBreakdownQuery = `
    SELECT
      c.id AS campus_id,
      c.name AS campus_name,
      c.code AS campus_code,
      c.slug AS campus_slug,
      COUNT(o.id)::integer AS order_count,
      COALESCE(SUM(o.total_kobo), 0)::bigint AS total_kobo,
      COALESCE(SUM(o.total_kobo) FILTER (WHERE o.payment_status = 'PAID'), 0)::bigint AS paid_revenue_kobo
    FROM public.campuses AS c
    LEFT JOIN public.orders AS o ON o.campus_id = c.id
      ${startDate ? `AND o.created_at >= '${new Date(startDate).toISOString()}'` : ''}
      ${endDate ? `AND o.created_at <= '${new Date(endDate).toISOString()}'` : ''}
    WHERE c.is_active = true
      ${campusId ? `AND (c.id::text = '${campusId}' OR c.slug = '${campusId}' OR c.legacy_key = '${campusId}')` : ''}
    GROUP BY c.id, c.name, c.code, c.slug
    ORDER BY order_count DESC
  `;

  // 5. Daily Time Series
  const dailyTimeSeriesQuery = `
    SELECT
      DATE_TRUNC('day', o.created_at)::date AS report_date,
      COUNT(*)::integer AS order_count,
      COALESCE(SUM(o.total_kobo), 0)::bigint AS total_kobo,
      COALESCE(SUM(o.total_kobo) FILTER (WHERE o.payment_status = 'PAID'), 0)::bigint AS paid_kobo
    FROM public.orders AS o
    LEFT JOIN public.campuses AS c ON c.id = o.campus_id
    ${whereClause}
    GROUP BY DATE_TRUNC('day', o.created_at)::date
    ORDER BY report_date ASC
  `;

  const [summaryRes, paymentMethodRes, orderStatusRes, campusRes, timeSeriesRes] =
    await Promise.all([
      executor.query(summaryQuery, params),
      executor.query(paymentMethodQuery, params),
      executor.query(orderStatusQuery, params),
      executor.query(campusBreakdownQuery),
      executor.query(dailyTimeSeriesQuery, params),
    ]);

  return {
    summary: summaryRes.rows[0] || {
      total_orders: 0,
      delivered_orders: 0,
      cancelled_orders: 0,
      pending_orders: 0,
      confirmed_orders: 0,
      paid_orders: 0,
      pending_payment_orders: 0,
      total_gmv_kobo: 0,
      total_paid_revenue_kobo: 0,
      total_delivery_fees_kobo: 0,
      total_service_fees_kobo: 0,
      avg_order_value_kobo: 0,
    },
    paymentMethods: paymentMethodRes.rows,
    orderStatuses: orderStatusRes.rows,
    campuses: campusRes.rows,
    dailyTimeline: timeSeriesRes.rows,
  };
};

/**
 * Retrieve campus-wide performance summaries
 */
const getCampusSummary = async (
  { startDate = null, endDate = null, campusId = null } = {},
  client = null
) => {
  const executor = getExecutor(client);
  const params = [];
  const campusFilter = [];

  if (campusId) {
    params.push(campusId);
    campusFilter.push(
      `(c.id::text = $${params.length} OR c.slug = $${params.length} OR c.legacy_key = $${params.length})`
    );
  }

  const whereClause = campusFilter.length
    ? `WHERE c.is_active = true AND ${campusFilter.join(' AND ')}`
    : `WHERE c.is_active = true`;

  const query = `
    SELECT
      c.id AS campus_id,
      c.name AS campus_name,
      c.code AS campus_code,
      c.slug AS campus_slug,
      c.city,
      c.state,
      c.is_active,
      (
        SELECT COUNT(DISTINCT vc.vendor_id)::integer
        FROM public.vendor_campuses AS vc
        JOIN public.vendors AS v ON v.id = vc.vendor_id
        WHERE vc.campus_id = c.id AND vc.is_active = true AND v.status = 'ACTIVE'
      ) AS active_vendors_count,
      (
        SELECT COUNT(p.id)::integer
        FROM public.products AS p
        WHERE p.campus_id = c.id AND p.is_in_stock = true
      ) AS active_products_count,
      (
        SELECT COUNT(s.id)::integer
        FROM public.services AS s
        WHERE s.campus_id = c.id AND s.is_active = true
      ) AS active_services_count,
      (
        SELECT COUNT(ml.id)::integer
        FROM public.marketplace_listings AS ml
        WHERE ml.campus_id = c.id AND ml.status = 'PUBLISHED' AND ml.deleted_at IS NULL
      ) AS active_marketplace_count,
      (
        SELECT COUNT(o.id)::integer
        FROM public.orders AS o
        WHERE o.campus_id = c.id
          ${startDate ? `AND o.created_at >= '${new Date(startDate).toISOString()}'` : ''}
          ${endDate ? `AND o.created_at <= '${new Date(endDate).toISOString()}'` : ''}
      ) AS total_orders_count,
      (
        SELECT COALESCE(SUM(o.total_kobo), 0)::bigint
        FROM public.orders AS o
        WHERE o.campus_id = c.id
          ${startDate ? `AND o.created_at >= '${new Date(startDate).toISOString()}'` : ''}
          ${endDate ? `AND o.created_at <= '${new Date(endDate).toISOString()}'` : ''}
      ) AS total_order_revenue_kobo,
      (
        SELECT COUNT(dr.id)::integer
        FROM public.delivery_requests AS dr
        WHERE dr.campus_id = c.id
          ${startDate ? `AND dr.created_at >= '${new Date(startDate).toISOString()}'` : ''}
          ${endDate ? `AND dr.created_at <= '${new Date(endDate).toISOString()}'` : ''}
      ) AS delivery_requests_count,
      (
        SELECT COUNT(sr.id)::integer
        FROM public.service_requests AS sr
        WHERE sr.campus_id = c.id
          ${startDate ? `AND sr.created_at >= '${new Date(startDate).toISOString()}'` : ''}
          ${endDate ? `AND sr.created_at <= '${new Date(endDate).toISOString()}'` : ''}
      ) AS service_requests_count
    FROM public.campuses AS c
    ${whereClause}
    ORDER BY c.name ASC
  `;

  const result = await executor.query(query, params);
  return result.rows;
};

/**
 * Retrieve vendor performance metrics and analytics
 */
const getVendorAnalytics = async (
  {
    startDate = null,
    endDate = null,
    campusId = null,
    vendorId = null,
    limit = 50,
    offset = 0,
  } = {},
  client = null
) => {
  const executor = getExecutor(client);
  const conditions = [];
  const params = [];

  if (vendorId) {
    params.push(vendorId);
    conditions.push(
      `(v.id::text = $${params.length} OR v.slug = $${params.length} OR v.legacy_key = $${params.length})`
    );
  }

  if (campusId) {
    params.push(campusId);
    conditions.push(`EXISTS (
      SELECT 1 FROM public.vendor_campuses AS vc
      JOIN public.campuses AS c ON c.id = vc.campus_id
      WHERE vc.vendor_id = v.id
        AND vc.is_active = true
        AND (c.id::text = $${params.length} OR c.slug = $${params.length} OR c.legacy_key = $${params.length})
    )`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  const query = `
    SELECT
      v.id AS vendor_id,
      v.name AS vendor_name,
      v.slug AS vendor_slug,
      v.status AS vendor_status,
      v.is_verified,
      v.rating AS current_rating,
      v.review_count,
      cat.name AS category_name,
      cat.slug AS category_slug,
      p.email AS owner_email,
      p.full_name AS owner_name,
      (
        SELECT COUNT(o.id)::integer
        FROM public.orders AS o
        WHERE o.vendor_id = v.id
          ${startDate ? `AND o.created_at >= '${new Date(startDate).toISOString()}'` : ''}
          ${endDate ? `AND o.created_at <= '${new Date(endDate).toISOString()}'` : ''}
      ) AS total_orders,
      (
        SELECT COUNT(o.id)::integer
        FROM public.orders AS o
        WHERE o.vendor_id = v.id AND o.status = 'DELIVERED'
          ${startDate ? `AND o.created_at >= '${new Date(startDate).toISOString()}'` : ''}
          ${endDate ? `AND o.created_at <= '${new Date(endDate).toISOString()}'` : ''}
      ) AS delivered_orders,
      (
        SELECT COUNT(o.id)::integer
        FROM public.orders AS o
        WHERE o.vendor_id = v.id AND o.status = 'CANCELLED'
          ${startDate ? `AND o.created_at >= '${new Date(startDate).toISOString()}'` : ''}
          ${endDate ? `AND o.created_at <= '${new Date(endDate).toISOString()}'` : ''}
      ) AS cancelled_orders,
      (
        SELECT COALESCE(SUM(o.total_kobo), 0)::bigint
        FROM public.orders AS o
        WHERE o.vendor_id = v.id
          ${startDate ? `AND o.created_at >= '${new Date(startDate).toISOString()}'` : ''}
          ${endDate ? `AND o.created_at <= '${new Date(endDate).toISOString()}'` : ''}
      ) AS total_gross_kobo,
      (
        SELECT COALESCE(SUM(o.total_kobo) FILTER (WHERE o.payment_status = 'PAID'), 0)::bigint
        FROM public.orders AS o
        WHERE o.vendor_id = v.id
          ${startDate ? `AND o.created_at >= '${new Date(startDate).toISOString()}'` : ''}
          ${endDate ? `AND o.created_at <= '${new Date(endDate).toISOString()}'` : ''}
      ) AS total_paid_kobo,
      (
        SELECT COUNT(prod.id)::integer
        FROM public.products AS prod
        WHERE prod.vendor_id = v.id AND prod.is_in_stock = true
      ) AS active_products_count
    FROM public.vendors AS v
    LEFT JOIN public.categories AS cat ON cat.id = v.category_id
    LEFT JOIN public.profiles AS p ON p.id = v.owner_user_id
    ${whereClause}
    ORDER BY total_gross_kobo DESC, v.name ASC
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `;

  const result = await executor.query(query, params);
  return result.rows;
};

/**
 * Export orders with customer, vendor, and campus detail records
 */
const getExportOrders = async (
  {
    startDate = null,
    endDate = null,
    campusId = null,
    status = null,
    paymentStatus = null,
    limit = 500,
    offset = 0,
  } = {},
  client = null
) => {
  const executor = getExecutor(client);
  const conditions = [];
  const params = [];

  if (startDate) {
    params.push(startDate);
    conditions.push(`o.created_at >= $${params.length}`);
  }
  if (endDate) {
    params.push(endDate);
    conditions.push(`o.created_at <= $${params.length}`);
  }
  if (campusId) {
    params.push(campusId);
    conditions.push(
      `(o.campus_id::text = $${params.length} OR c.slug = $${params.length} OR c.legacy_key = $${params.length})`
    );
  }
  if (status) {
    params.push(status.toUpperCase());
    conditions.push(`o.status = $${params.length}`);
  }
  if (paymentStatus) {
    params.push(paymentStatus.toUpperCase());
    conditions.push(`o.payment_status = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  const query = `
    SELECT
      o.id AS order_id,
      o.created_at,
      o.status AS order_status,
      o.type AS order_type,
      o.payment_method,
      o.payment_status,
      o.subtotal_kobo,
      o.delivery_fee_kobo,
      o.service_fee_kobo,
      o.total_kobo,
      o.delivery_address,
      o.phone_number,
      o.notes,
      o.delivered_at,
      o.cancelled_at,
      p.id AS customer_user_id,
      p.full_name AS customer_name,
      p.email AS customer_email,
      p.phone_number AS customer_registered_phone,
      v.id AS vendor_id,
      v.name AS vendor_name,
      v.slug AS vendor_slug,
      c.id AS campus_id,
      c.name AS campus_name,
      c.code AS campus_code,
      dz.name AS delivery_zone_name,
      (
        SELECT json_agg(
          json_build_object(
            'productId', oi.product_id,
            'quantity', oi.quantity,
            'unitPriceKobo', oi.unit_price_kobo,
            'totalPriceKobo', oi.total_price_kobo
          )
        )
        FROM public.order_items AS oi
        WHERE oi.order_id = o.id
      ) AS items
    FROM public.orders AS o
    LEFT JOIN public.profiles AS p ON p.id = o.user_id
    LEFT JOIN public.vendors AS v ON v.id = o.vendor_id
    LEFT JOIN public.campuses AS c ON c.id = o.campus_id
    LEFT JOIN public.delivery_zones AS dz ON dz.id = o.delivery_zone_id
    ${whereClause}
    ORDER BY o.created_at DESC
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `;

  const result = await executor.query(query, params);
  return result.rows;
};

/**
 * Export vendors directory records
 */
const getExportVendors = async (
  { campusId = null, status = null, limit = 500, offset = 0 } = {},
  client = null
) => {
  const executor = getExecutor(client);
  const conditions = [];
  const params = [];

  if (campusId) {
    params.push(campusId);
    conditions.push(`EXISTS (
      SELECT 1 FROM public.vendor_campuses AS vc
      JOIN public.campuses AS c ON c.id = vc.campus_id
      WHERE vc.vendor_id = v.id
        AND vc.is_active = true
        AND (c.id::text = $${params.length} OR c.slug = $${params.length} OR c.legacy_key = $${params.length})
    )`);
  }

  if (status) {
    params.push(status.toUpperCase());
    conditions.push(`v.status = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  const query = `
    SELECT
      v.id AS vendor_id,
      v.name AS vendor_name,
      v.slug AS vendor_slug,
      v.legacy_key,
      v.location,
      v.phone_number,
      v.email,
      v.description,
      v.status,
      v.is_verified,
      v.rating,
      v.review_count,
      v.created_at,
      p.full_name AS owner_name,
      p.email AS owner_email,
      cat.name AS category_name,
      cat.slug AS category_slug
    FROM public.vendors AS v
    LEFT JOIN public.profiles AS p ON p.id = v.owner_user_id
    LEFT JOIN public.categories AS cat ON cat.id = v.category_id
    ${whereClause}
    ORDER BY v.created_at DESC
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `;

  const result = await executor.query(query, params);
  return result.rows;
};

/**
 * Export marketplace listings records
 */
const getExportMarketplaceListings = async (
  { campusId = null, status = null, limit = 500, offset = 0 } = {},
  client = null
) => {
  const executor = getExecutor(client);
  const conditions = ['ml.deleted_at IS NULL'];
  const params = [];

  if (campusId) {
    params.push(campusId);
    conditions.push(
      `(ml.campus_id::text = $${params.length} OR c.slug = $${params.length} OR c.legacy_key = $${params.length})`
    );
  }

  if (status) {
    params.push(status.toUpperCase());
    conditions.push(`ml.status = $${params.length}`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  const query = `
    SELECT
      ml.id AS listing_id,
      ml.title,
      ml.description,
      ml.price_kobo,
      ml.original_price_kobo,
      ml.condition,
      ml.status,
      ml.seller_department,
      ml.seller_contact_phone,
      ml.rejection_reason,
      ml.date_listed,
      ml.date_sold,
      ml.created_at,
      p.full_name AS seller_name,
      p.email AS seller_email,
      c.name AS campus_name,
      c.code AS campus_code,
      cat.name AS category_name
    FROM public.marketplace_listings AS ml
    LEFT JOIN public.profiles AS p ON p.id = ml.seller_user_id
    LEFT JOIN public.campuses AS c ON c.id = ml.campus_id
    LEFT JOIN public.categories AS cat ON cat.id = ml.category_id
    ${whereClause}
    ORDER BY ml.created_at DESC
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `;

  const result = await executor.query(query, params);
  return result.rows;
};

/**
 * Export campus delivery tasks
 */
const getExportDeliveries = async (
  {
    startDate = null,
    endDate = null,
    campusId = null,
    status = null,
    limit = 500,
    offset = 0,
  } = {},
  client = null
) => {
  const executor = getExecutor(client);
  const conditions = [];
  const params = [];

  if (startDate) {
    params.push(startDate);
    conditions.push(`dr.created_at >= $${params.length}`);
  }
  if (endDate) {
    params.push(endDate);
    conditions.push(`dr.created_at <= $${params.length}`);
  }
  if (campusId) {
    params.push(campusId);
    conditions.push(
      `(dr.campus_id::text = $${params.length} OR c.slug = $${params.length} OR c.legacy_key = $${params.length})`
    );
  }
  if (status) {
    params.push(status.toUpperCase());
    conditions.push(`dr.status = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  const query = `
    SELECT
      dr.id AS delivery_id,
      dr.task_type,
      dr.pickup_location,
      dr.dropoff_location,
      dr.description,
      dr.estimated_fee_kobo,
      dr.actual_fee_kobo,
      dr.urgency,
      dr.preferred_at,
      dr.status,
      dr.notes,
      dr.created_at,
      dr.picked_up_at,
      dr.delivered_at,
      req.full_name AS requester_name,
      req.email AS requester_email,
      rider.full_name AS rider_name,
      rider.email AS rider_email,
      c.name AS campus_name,
      c.code AS campus_code
    FROM public.delivery_requests AS dr
    LEFT JOIN public.profiles AS req ON req.id = dr.requester_user_id
    LEFT JOIN public.profiles AS rider ON rider.id = dr.rider_user_id
    LEFT JOIN public.campuses AS c ON c.id = dr.campus_id
    ${whereClause}
    ORDER BY dr.created_at DESC
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `;

  const result = await executor.query(query, params);
  return result.rows;
};

/**
 * Export service requests
 */
const getExportServiceRequests = async (
  {
    startDate = null,
    endDate = null,
    campusId = null,
    status = null,
    limit = 500,
    offset = 0,
  } = {},
  client = null
) => {
  const executor = getExecutor(client);
  const conditions = [];
  const params = [];

  if (startDate) {
    params.push(startDate);
    conditions.push(`sr.created_at >= $${params.length}`);
  }
  if (endDate) {
    params.push(endDate);
    conditions.push(`sr.created_at <= $${params.length}`);
  }
  if (campusId) {
    params.push(campusId);
    conditions.push(
      `(sr.campus_id::text = $${params.length} OR c.slug = $${params.length} OR c.legacy_key = $${params.length})`
    );
  }
  if (status) {
    params.push(status.toUpperCase());
    conditions.push(`sr.status = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  const query = `
    SELECT
      sr.id AS service_request_id,
      sr.delivery_type,
      sr.customer_location,
      sr.description,
      sr.file_url,
      sr.estimated_budget_kobo,
      sr.preferred_date,
      sr.preferred_time,
      sr.status,
      sr.notes,
      sr.created_at,
      sr.completed_at,
      s.name AS service_name,
      req.full_name AS requester_name,
      req.email AS requester_email,
      prov.full_name AS provider_name,
      prov.email AS provider_email,
      v.name AS vendor_name,
      c.name AS campus_name,
      c.code AS campus_code
    FROM public.service_requests AS sr
    LEFT JOIN public.services AS s ON s.id = sr.service_id
    LEFT JOIN public.profiles AS req ON req.id = sr.requester_user_id
    LEFT JOIN public.profiles AS prov ON prov.id = sr.provider_user_id
    LEFT JOIN public.vendors AS v ON v.id = sr.vendor_id
    LEFT JOIN public.campuses AS c ON c.id = sr.campus_id
    ${whereClause}
    ORDER BY sr.created_at DESC
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `;

  const result = await executor.query(query, params);
  return result.rows;
};

/**
 * Retrieve high-level system entity counts for backup snapshot
 */
const getSystemSnapshot = async (client = null) => {
  const executor = getExecutor(client);

  const query = `
    SELECT
      (SELECT COUNT(*)::integer FROM public.profiles) AS profiles_count,
      (SELECT COUNT(*)::integer FROM public.campuses WHERE is_active = true) AS active_campuses_count,
      (SELECT COUNT(*)::integer FROM public.vendors WHERE status = 'ACTIVE') AS active_vendors_count,
      (SELECT COUNT(*)::integer FROM public.products WHERE is_in_stock = true) AS in_stock_products_count,
      (SELECT COUNT(*)::integer FROM public.services WHERE is_active = true) AS active_services_count,
      (SELECT COUNT(*)::integer FROM public.marketplace_listings WHERE status = 'PUBLISHED' AND deleted_at IS NULL) AS published_listings_count,
      (SELECT COUNT(*)::integer FROM public.orders) AS total_orders_count,
      (SELECT COUNT(*)::integer FROM public.orders WHERE status = 'DELIVERED') AS delivered_orders_count,
      (SELECT COUNT(*)::integer FROM public.delivery_requests) AS delivery_requests_count,
      (SELECT COUNT(*)::integer FROM public.service_requests) AS service_requests_count,
      (SELECT COUNT(*)::integer FROM public.order_payments WHERE status = 'PAID') AS successful_payments_count,
      (SELECT COALESCE(SUM(total_kobo), 0)::bigint FROM public.orders) AS platform_gmv_kobo,
      (SELECT COALESCE(SUM(amount_kobo), 0)::bigint FROM public.order_payments WHERE status = 'PAID') AS platform_collected_revenue_kobo
  `;

  const result = await executor.query(query);
  return result.rows[0] || {};
};

module.exports = {
  getSalesReport,
  getCampusSummary,
  getVendorAnalytics,
  getExportOrders,
  getExportVendors,
  getExportMarketplaceListings,
  getExportDeliveries,
  getExportServiceRequests,
  getSystemSnapshot,
};
