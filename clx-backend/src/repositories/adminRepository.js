/**
 * Admin Repository
 * Handles direct database access for administrative oversight, analytics,
 * moderation, and system auditing across all platform entities.
 */

const database = require('../config/database');

/**
 * Normalizes campus filter for query conditions
 */
const appendCampusCondition = (conditions, params, campusId, columnRef) => {
  if (!campusId) return;
  params.push(String(campusId).trim());
  conditions.push(`(${columnRef}::text = $${params.length} OR EXISTS (
    SELECT 1 FROM public.campuses AS c
    WHERE c.id = ${columnRef}
      AND (c.slug = $${params.length} OR c.legacy_key = $${params.length})
  ))`);
};

// ==========================================
// 1. DASHBOARD SUMMARY & ANALYTICS
// ==========================================

const getDashboardStats = async ({ campusId } = {}) => {
  const campusParams = [];
  let userCampusClause = '';
  let vendorCampusClause = '';
  let productCampusClause = '';
  let listingCampusClause = '';
  let serviceCampusClause = '';
  let orderCampusClause = '';
  let deliveryCampusClause = '';

  if (campusId) {
    campusParams.push(String(campusId).trim());
    const idx = campusParams.length;
    userCampusClause = `WHERE (p.default_campus_id::text = $${idx} OR EXISTS (
      SELECT 1 FROM public.campuses AS c WHERE c.id = p.default_campus_id AND (c.slug = $${idx} OR c.legacy_key = $${idx})
    ))`;
    vendorCampusClause = `WHERE EXISTS (
      SELECT 1 FROM public.vendor_campuses AS vc
      JOIN public.campuses AS c ON c.id = vc.campus_id
      WHERE vc.vendor_id = v.id AND (c.id::text = $${idx} OR c.slug = $${idx} OR c.legacy_key = $${idx})
    )`;
    productCampusClause = `WHERE (pr.campus_id::text = $${idx} OR EXISTS (
      SELECT 1 FROM public.campuses AS c WHERE c.id = pr.campus_id AND (c.slug = $${idx} OR c.legacy_key = $${idx})
    ))`;
    listingCampusClause = `WHERE (ml.campus_id::text = $${idx} OR EXISTS (
      SELECT 1 FROM public.campuses AS c WHERE c.id = ml.campus_id AND (c.slug = $${idx} OR c.legacy_key = $${idx})
    ))`;
    serviceCampusClause = `WHERE (s.campus_id::text = $${idx} OR EXISTS (
      SELECT 1 FROM public.campuses AS c WHERE c.id = s.campus_id AND (c.slug = $${idx} OR c.legacy_key = $${idx})
    ))`;
    orderCampusClause = `WHERE (o.campus_id::text = $${idx} OR EXISTS (
      SELECT 1 FROM public.campuses AS c WHERE c.id = o.campus_id AND (c.slug = $${idx} OR c.legacy_key = $${idx})
    ))`;
    deliveryCampusClause = `WHERE (dr.campus_id::text = $${idx} OR EXISTS (
      SELECT 1 FROM public.campuses AS c WHERE c.id = dr.campus_id AND (c.slug = $${idx} OR c.legacy_key = $${idx})
    ))`;
  }

  // Users overview
  const userStatsQuery = database.query(
    `SELECT COUNT(*)::integer AS total_users,
            COUNT(CASE WHEN p.is_active THEN 1 END)::integer AS active_users,
            COUNT(CASE WHEN NOT p.is_active THEN 1 END)::integer AS inactive_users
       FROM public.profiles AS p
      ${userCampusClause}`,
    campusParams
  );

  // Users by role
  const rolesQuery = database.query(
    `SELECT ur.role, COUNT(*)::integer AS count
       FROM public.user_roles AS ur
       JOIN public.profiles AS p ON p.id = ur.user_id
      ${userCampusClause}
      GROUP BY ur.role`,
    campusParams
  );

  // Vendors overview
  const vendorStatsQuery = database.query(
    `SELECT COUNT(*)::integer AS total_vendors,
            COUNT(CASE WHEN v.status = 'ACTIVE' THEN 1 END)::integer AS active_vendors,
            COUNT(CASE WHEN v.status = 'PENDING' THEN 1 END)::integer AS pending_vendors,
            COUNT(CASE WHEN v.status = 'SUSPENDED' THEN 1 END)::integer AS suspended_vendors,
            COUNT(CASE WHEN v.status = 'CLOSED' THEN 1 END)::integer AS closed_vendors,
            COUNT(CASE WHEN v.is_verified THEN 1 END)::integer AS verified_vendors
       FROM public.vendors AS v
      ${vendorCampusClause}`,
    campusParams
  );

  // Products overview
  const productStatsQuery = database.query(
    `SELECT COUNT(*)::integer AS total_products,
            COUNT(CASE WHEN pr.is_in_stock THEN 1 END)::integer AS in_stock_products,
            COUNT(CASE WHEN NOT pr.is_in_stock THEN 1 END)::integer AS out_of_stock_products
       FROM public.products AS pr
      ${productCampusClause}`,
    campusParams
  );

  // Marketplace listings overview
  const listingStatsQuery = database.query(
    `SELECT COUNT(*)::integer AS total_listings,
            COUNT(CASE WHEN ml.status = 'PENDING_REVIEW' THEN 1 END)::integer AS pending_review_listings,
            COUNT(CASE WHEN ml.status = 'PUBLISHED' THEN 1 END)::integer AS published_listings,
            COUNT(CASE WHEN ml.status = 'SOLD' THEN 1 END)::integer AS sold_listings,
            COUNT(CASE WHEN ml.status = 'REJECTED' THEN 1 END)::integer AS rejected_listings,
            COUNT(CASE WHEN ml.status = 'REMOVED' THEN 1 END)::integer AS removed_listings
       FROM public.marketplace_listings AS ml
      ${listingCampusClause}`,
    campusParams
  );

  // Services overview
  const serviceStatsQuery = database.query(
    `SELECT COUNT(*)::integer AS total_services,
            COUNT(CASE WHEN s.is_active THEN 1 END)::integer AS active_services
       FROM public.services AS s
      ${serviceCampusClause}`,
    campusParams
  );

  // Orders overview
  const orderStatsQuery = database.query(
    `SELECT COUNT(*)::integer AS total_orders,
            COUNT(CASE WHEN o.status = 'PENDING' THEN 1 END)::integer AS pending_orders,
            COUNT(CASE WHEN o.status = 'CONFIRMED' THEN 1 END)::integer AS confirmed_orders,
            COUNT(CASE WHEN o.status = 'PREPARING' THEN 1 END)::integer AS preparing_orders,
            COUNT(CASE WHEN o.status = 'READY' THEN 1 END)::integer AS ready_orders,
            COUNT(CASE WHEN o.status = 'IN_TRANSIT' THEN 1 END)::integer AS in_transit_orders,
            COUNT(CASE WHEN o.status = 'DELIVERED' THEN 1 END)::integer AS delivered_orders,
            COUNT(CASE WHEN o.status = 'CANCELLED' THEN 1 END)::integer AS cancelled_orders,
            COALESCE(SUM(CASE WHEN o.status = 'DELIVERED' THEN o.total_kobo ELSE 0 END), 0)::bigint AS total_revenue_kobo,
            COALESCE(SUM(o.total_kobo), 0)::bigint AS gross_order_value_kobo
       FROM public.orders AS o
      ${orderCampusClause}`,
    campusParams
  );

  // Deliveries overview
  const deliveryStatsQuery = database.query(
    `SELECT COUNT(*)::integer AS total_deliveries,
            COUNT(CASE WHEN dr.status = 'REQUESTED' THEN 1 END)::integer AS requested_deliveries,
            COUNT(CASE WHEN dr.status = 'ACCEPTED' THEN 1 END)::integer AS accepted_deliveries,
            COUNT(CASE WHEN dr.status = 'PICKED_UP' THEN 1 END)::integer AS picked_up_deliveries,
            COUNT(CASE WHEN dr.status = 'IN_TRANSIT' THEN 1 END)::integer AS in_transit_deliveries,
            COUNT(CASE WHEN dr.status = 'DELIVERED' THEN 1 END)::integer AS delivered_deliveries,
            COUNT(CASE WHEN dr.status = 'CANCELLED' THEN 1 END)::integer AS cancelled_deliveries
       FROM public.delivery_requests AS dr
      ${deliveryCampusClause}`,
    campusParams
  );

  const [
    userRes,
    rolesRes,
    vendorRes,
    productRes,
    listingRes,
    serviceRes,
    orderRes,
    deliveryRes,
  ] = await Promise.all([
    userStatsQuery,
    rolesQuery,
    vendorStatsQuery,
    productStatsQuery,
    listingStatsQuery,
    serviceStatsQuery,
    orderStatsQuery,
    deliveryStatsQuery,
  ]);

  const rolesMap = {};
  (rolesRes.rows || []).forEach((r) => {
    rolesMap[r.role] = r.count;
  });

  return {
    users: {
      total: userRes.rows[0]?.total_users || 0,
      active: userRes.rows[0]?.active_users || 0,
      inactive: userRes.rows[0]?.inactive_users || 0,
      byRole: {
        CUSTOMER: rolesMap.CUSTOMER || 0,
        VENDOR: rolesMap.VENDOR || 0,
        RIDER: rolesMap.RIDER || 0,
        ADMIN: rolesMap.ADMIN || 0,
        SUPER_ADMIN: rolesMap.SUPER_ADMIN || 0,
      },
    },
    vendors: {
      total: vendorRes.rows[0]?.total_vendors || 0,
      active: vendorRes.rows[0]?.active_vendors || 0,
      pending: vendorRes.rows[0]?.pending_vendors || 0,
      suspended: vendorRes.rows[0]?.suspended_vendors || 0,
      closed: vendorRes.rows[0]?.closed_vendors || 0,
      verified: vendorRes.rows[0]?.verified_vendors || 0,
    },
    products: {
      total: productRes.rows[0]?.total_products || 0,
      inStock: productRes.rows[0]?.in_stock_products || 0,
      outOfStock: productRes.rows[0]?.out_of_stock_products || 0,
    },
    marketplace: {
      total: listingRes.rows[0]?.total_listings || 0,
      pendingReview: listingRes.rows[0]?.pending_review_listings || 0,
      published: listingRes.rows[0]?.published_listings || 0,
      sold: listingRes.rows[0]?.sold_listings || 0,
      rejected: listingRes.rows[0]?.rejected_listings || 0,
      removed: listingRes.rows[0]?.removed_listings || 0,
    },
    services: {
      total: serviceRes.rows[0]?.total_services || 0,
      active: serviceRes.rows[0]?.active_services || 0,
    },
    orders: {
      total: orderRes.rows[0]?.total_orders || 0,
      pending: orderRes.rows[0]?.pending_orders || 0,
      confirmed: orderRes.rows[0]?.confirmed_orders || 0,
      preparing: orderRes.rows[0]?.preparing_orders || 0,
      ready: orderRes.rows[0]?.ready_orders || 0,
      inTransit: orderRes.rows[0]?.in_transit_orders || 0,
      delivered: orderRes.rows[0]?.delivered_orders || 0,
      cancelled: orderRes.rows[0]?.cancelled_orders || 0,
      totalRevenueKobo: String(orderRes.rows[0]?.total_revenue_kobo || 0),
      grossOrderValueKobo: String(orderRes.rows[0]?.gross_order_value_kobo || 0),
    },
    deliveries: {
      total: deliveryRes.rows[0]?.total_deliveries || 0,
      requested: deliveryRes.rows[0]?.requested_deliveries || 0,
      accepted: deliveryRes.rows[0]?.accepted_deliveries || 0,
      pickedUp: deliveryRes.rows[0]?.picked_up_deliveries || 0,
      inTransit: deliveryRes.rows[0]?.in_transit_deliveries || 0,
      delivered: deliveryRes.rows[0]?.delivered_deliveries || 0,
      cancelled: deliveryRes.rows[0]?.cancelled_deliveries || 0,
    },
  };
};

// ==========================================
// 2. VENDOR MODERATION & MANAGEMENT
// ==========================================

const listAdminVendors = async ({
  status,
  campusId,
  categoryId,
  search,
  isVerified,
  limit = 20,
  offset = 0,
} = {}) => {
  const conditions = [];
  const params = [];

  if (status) {
    params.push(String(status).toUpperCase());
    conditions.push(`v.status = $${params.length}`);
  }

  if (isVerified !== undefined && isVerified !== null && isVerified !== '') {
    params.push(isVerified === true || isVerified === 'true');
    conditions.push(`v.is_verified = $${params.length}`);
  }

  if (campusId) {
    params.push(String(campusId).trim());
    conditions.push(`EXISTS (
      SELECT 1 FROM public.vendor_campuses AS vc
      JOIN public.campuses AS c ON c.id = vc.campus_id
      WHERE vc.vendor_id = v.id
        AND (c.id::text = $${params.length} OR c.slug = $${params.length} OR c.legacy_key = $${params.length})
    )`);
  }

  if (categoryId) {
    params.push(String(categoryId).trim());
    conditions.push(`EXISTS (
      SELECT 1 FROM public.categories AS cat
      WHERE (cat.id = v.category_id OR cat.parent_id = v.category_id)
        AND (cat.id::text = $${params.length} OR cat.slug = $${params.length} OR cat.legacy_key = $${params.length})
    )`);
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(v.name ILIKE $${params.length} OR v.description ILIKE $${params.length} OR v.location ILIKE $${params.length} OR v.email ILIKE $${params.length} OR v.phone_number ILIKE $${params.length})`);
  }

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await database.query(
    `SELECT v.id,
            v.legacy_key,
            v.owner_user_id,
            v.name,
            v.slug,
            v.category_id,
            v.location,
            v.phone_number,
            v.email,
            v.description,
            v.image_url,
            v.status,
            v.is_verified,
            v.rating,
            v.review_count,
            v.created_at,
            v.updated_at,
            p.full_name AS owner_name,
            p.email AS owner_email,
            p.phone_number AS owner_phone,
            cat.name AS category_name,
            cat.slug AS category_slug,
            (SELECT COUNT(*)::integer FROM public.products AS pr WHERE pr.vendor_id = v.id) AS product_count,
            (SELECT COUNT(*)::integer FROM public.orders AS o WHERE o.vendor_id = v.id) AS order_count
       FROM public.vendors AS v
  LEFT JOIN public.profiles AS p ON p.id = v.owner_user_id
  LEFT JOIN public.categories AS cat ON cat.id = v.category_id
      ${whereClause}
      ORDER BY v.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  return result.rows;
};

const countAdminVendors = async ({
  status,
  campusId,
  categoryId,
  search,
  isVerified,
} = {}) => {
  const conditions = [];
  const params = [];

  if (status) {
    params.push(String(status).toUpperCase());
    conditions.push(`v.status = $${params.length}`);
  }

  if (isVerified !== undefined && isVerified !== null && isVerified !== '') {
    params.push(isVerified === true || isVerified === 'true');
    conditions.push(`v.is_verified = $${params.length}`);
  }

  if (campusId) {
    params.push(String(campusId).trim());
    conditions.push(`EXISTS (
      SELECT 1 FROM public.vendor_campuses AS vc
      JOIN public.campuses AS c ON c.id = vc.campus_id
      WHERE vc.vendor_id = v.id
        AND (c.id::text = $${params.length} OR c.slug = $${params.length} OR c.legacy_key = $${params.length})
    )`);
  }

  if (categoryId) {
    params.push(String(categoryId).trim());
    conditions.push(`EXISTS (
      SELECT 1 FROM public.categories AS cat
      WHERE (cat.id = v.category_id OR cat.parent_id = v.category_id)
        AND (cat.id::text = $${params.length} OR cat.slug = $${params.length} OR cat.legacy_key = $${params.length})
    )`);
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(v.name ILIKE $${params.length} OR v.description ILIKE $${params.length} OR v.location ILIKE $${params.length} OR v.email ILIKE $${params.length} OR v.phone_number ILIKE $${params.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await database.query(
    `SELECT COUNT(*)::integer AS count
       FROM public.vendors AS v
      ${whereClause}`,
    params
  );

  return result.rows[0] ? result.rows[0].count : 0;
};

const getAdminVendorById = async (vendorId) => {
  const result = await database.query(
    `SELECT v.id,
            v.legacy_key,
            v.owner_user_id,
            v.name,
            v.slug,
            v.category_id,
            v.location,
            v.phone_number,
            v.email,
            v.description,
            v.image_url,
            v.status,
            v.is_verified,
            v.rating,
            v.review_count,
            v.created_at,
            v.updated_at,
            p.full_name AS owner_name,
            p.email AS owner_email,
            p.phone_number AS owner_phone,
            p.student_id AS owner_student_id,
            cat.name AS category_name,
            cat.slug AS category_slug,
            (SELECT COUNT(*)::integer FROM public.products AS pr WHERE pr.vendor_id = v.id) AS product_count,
            (SELECT COUNT(*)::integer FROM public.orders AS o WHERE o.vendor_id = v.id) AS order_count
       FROM public.vendors AS v
  LEFT JOIN public.profiles AS p ON p.id = v.owner_user_id
  LEFT JOIN public.categories AS cat ON cat.id = v.category_id
      WHERE (v.id::text = $1 OR v.slug = $1 OR v.legacy_key = $1)
      LIMIT 1`,
    [vendorId]
  );

  const vendor = result.rows[0] || null;
  if (!vendor) return null;

  // Fetch campuses and operating hours
  const campusesRes = await database.query(
    `SELECT vc.vendor_id, vc.campus_id, vc.location, vc.is_active,
            c.name AS campus_name, c.slug AS campus_slug, c.short_name AS campus_short_name
       FROM public.vendor_campuses AS vc
       JOIN public.campuses AS c ON c.id = vc.campus_id
      WHERE vc.vendor_id = $1
      ORDER BY c.name ASC`,
    [vendor.id]
  );

  const hoursRes = await database.query(
    `SELECT voh.id, voh.vendor_id, voh.campus_id, voh.day_of_week,
            voh.opens_at, voh.closes_at, voh.is_closed,
            voh.created_at, voh.updated_at
       FROM public.vendor_operating_hours AS voh
      WHERE voh.vendor_id = $1
      ORDER BY voh.day_of_week ASC`,
    [vendor.id]
  );

  return {
    ...vendor,
    campuses: campusesRes.rows,
    operatingHours: hoursRes.rows,
  };
};

const updateAdminVendor = async (vendorId, fields = {}) => {
  const allowedCols = ['status', 'is_verified', 'name', 'description', 'phone_number', 'email', 'location'];
  const setClauses = [];
  const params = [];

  for (const [key, col] of [
    ['status', 'status'],
    ['is_verified', 'is_verified'],
    ['isVerified', 'is_verified'],
    ['name', 'name'],
    ['description', 'description'],
    ['phone_number', 'phone_number'],
    ['phoneNumber', 'phone_number'],
    ['email', 'email'],
    ['location', 'location'],
  ]) {
    if (fields[key] !== undefined && !setClauses.some((c) => c.startsWith(`${col} =`))) {
      params.push(fields[key]);
      setClauses.push(`${col} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) {
    return getAdminVendorById(vendorId);
  }

  params.push(vendorId);
  const whereIdx = params.length;

  const result = await database.query(
    `UPDATE public.vendors
        SET ${setClauses.join(', ')}, updated_at = NOW()
      WHERE (id::text = $${whereIdx} OR slug = $${whereIdx} OR legacy_key = $${whereIdx})
      RETURNING id, legacy_key, owner_user_id, name, slug, category_id,
                location, phone_number, email, description, image_url,
                status, is_verified, rating, review_count, created_at, updated_at`,
    params
  );

  return result.rows[0] || null;
};

// ==========================================
// 3. PRODUCT / CATALOG MODERATION
// ==========================================

const listAdminProducts = async ({
  search,
  vendorId,
  campusId,
  categoryId,
  isInStock,
  limit = 20,
  offset = 0,
} = {}) => {
  const conditions = [];
  const params = [];

  if (vendorId) {
    params.push(String(vendorId).trim());
    conditions.push(`(pr.vendor_id::text = $${params.length} OR EXISTS (
      SELECT 1 FROM public.vendors AS v WHERE v.id = pr.vendor_id AND (v.slug = $${params.length} OR v.legacy_key = $${params.length})
    ))`);
  }

  if (campusId) {
    appendCampusCondition(conditions, params, campusId, 'pr.campus_id');
  }

  if (categoryId) {
    params.push(String(categoryId).trim());
    conditions.push(`(pr.category_id::text = $${params.length} OR pr.subcategory_id::text = $${params.length} OR EXISTS (
      SELECT 1 FROM public.categories AS cat WHERE (cat.id = pr.category_id OR cat.id = pr.subcategory_id) AND (cat.slug = $${params.length} OR cat.legacy_key = $${params.length})
    ))`);
  }

  if (isInStock !== undefined && isInStock !== null && isInStock !== '') {
    params.push(isInStock === true || isInStock === 'true');
    conditions.push(`pr.is_in_stock = $${params.length}`);
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(pr.name ILIKE $${params.length} OR pr.description ILIKE $${params.length})`);
  }

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await database.query(
    `SELECT pr.id,
            pr.legacy_key,
            pr.slug,
            pr.vendor_id,
            pr.campus_id,
            pr.category_id,
            pr.subcategory_id,
            pr.name,
            pr.description,
            pr.price_kobo,
            pr.original_price_kobo,
            pr.image_url,
            pr.rating,
            pr.review_count,
            pr.is_popular,
            pr.is_in_stock,
            pr.stock_quantity,
            pr.created_at,
            pr.updated_at,
            v.name AS vendor_name,
            v.slug AS vendor_slug,
            v.status AS vendor_status,
            c.name AS campus_name,
            c.slug AS campus_slug,
            cat.name AS category_name,
            cat.slug AS category_slug
       FROM public.products AS pr
       JOIN public.vendors AS v ON v.id = pr.vendor_id
       JOIN public.campuses AS c ON c.id = pr.campus_id
       JOIN public.categories AS cat ON cat.id = pr.category_id
      ${whereClause}
      ORDER BY pr.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  return result.rows;
};

const countAdminProducts = async ({
  search,
  vendorId,
  campusId,
  categoryId,
  isInStock,
} = {}) => {
  const conditions = [];
  const params = [];

  if (vendorId) {
    params.push(String(vendorId).trim());
    conditions.push(`(pr.vendor_id::text = $${params.length} OR EXISTS (
      SELECT 1 FROM public.vendors AS v WHERE v.id = pr.vendor_id AND (v.slug = $${params.length} OR v.legacy_key = $${params.length})
    ))`);
  }

  if (campusId) {
    appendCampusCondition(conditions, params, campusId, 'pr.campus_id');
  }

  if (categoryId) {
    params.push(String(categoryId).trim());
    conditions.push(`(pr.category_id::text = $${params.length} OR pr.subcategory_id::text = $${params.length} OR EXISTS (
      SELECT 1 FROM public.categories AS cat WHERE (cat.id = pr.category_id OR cat.id = pr.subcategory_id) AND (cat.slug = $${params.length} OR cat.legacy_key = $${params.length})
    ))`);
  }

  if (isInStock !== undefined && isInStock !== null && isInStock !== '') {
    params.push(isInStock === true || isInStock === 'true');
    conditions.push(`pr.is_in_stock = $${params.length}`);
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(pr.name ILIKE $${params.length} OR pr.description ILIKE $${params.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await database.query(
    `SELECT COUNT(*)::integer AS count
       FROM public.products AS pr
      ${whereClause}`,
    params
  );

  return result.rows[0] ? result.rows[0].count : 0;
};

const getAdminProductById = async (productId) => {
  const result = await database.query(
    `SELECT pr.id,
            pr.legacy_key,
            pr.slug,
            pr.vendor_id,
            pr.campus_id,
            pr.category_id,
            pr.subcategory_id,
            pr.name,
            pr.description,
            pr.price_kobo,
            pr.original_price_kobo,
            pr.image_url,
            pr.rating,
            pr.review_count,
            pr.is_popular,
            pr.is_in_stock,
            pr.stock_quantity,
            pr.created_at,
            pr.updated_at,
            v.name AS vendor_name,
            v.slug AS vendor_slug,
            v.status AS vendor_status,
            c.name AS campus_name,
            c.slug AS campus_slug,
            cat.name AS category_name,
            cat.slug AS category_slug
       FROM public.products AS pr
       JOIN public.vendors AS v ON v.id = pr.vendor_id
       JOIN public.campuses AS c ON c.id = pr.campus_id
       JOIN public.categories AS cat ON cat.id = pr.category_id
      WHERE (pr.id::text = $1 OR pr.slug = $1 OR pr.legacy_key = $1)
      LIMIT 1`,
    [productId]
  );

  return result.rows[0] || null;
};

const updateAdminProduct = async (productId, fields = {}) => {
  const setClauses = [];
  const params = [];

  for (const [key, col] of [
    ['is_in_stock', 'is_in_stock'],
    ['isInStock', 'is_in_stock'],
    ['stock_quantity', 'stock_quantity'],
    ['stockQuantity', 'stock_quantity'],
    ['price_kobo', 'price_kobo'],
    ['priceKobo', 'price_kobo'],
    ['original_price_kobo', 'original_price_kobo'],
    ['originalPriceKobo', 'original_price_kobo'],
    ['is_popular', 'is_popular'],
    ['isPopular', 'is_popular'],
    ['name', 'name'],
    ['description', 'description'],
  ]) {
    if (fields[key] !== undefined && !setClauses.some((c) => c.startsWith(`${col} =`))) {
      params.push(fields[key]);
      setClauses.push(`${col} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) {
    return getAdminProductById(productId);
  }

  params.push(productId);
  const whereIdx = params.length;

  const result = await database.query(
    `UPDATE public.products
        SET ${setClauses.join(', ')}, updated_at = NOW()
      WHERE (id::text = $${whereIdx} OR slug = $${whereIdx} OR legacy_key = $${whereIdx})
      RETURNING id, legacy_key, slug, vendor_id, campus_id, category_id,
                subcategory_id, name, description, price_kobo, original_price_kobo,
                image_url, rating, review_count, is_popular, is_in_stock,
                stock_quantity, created_at, updated_at`,
    params
  );

  return result.rows[0] || null;
};

const deleteAdminProduct = async (productId) => {
  const result = await database.query(
    `DELETE FROM public.products
      WHERE (id::text = $1 OR slug = $1 OR legacy_key = $1)
      RETURNING id, name, slug, vendor_id`,
    [productId]
  );

  return result.rows[0] || null;
};

// ==========================================
// 4. STUDENT MARKETPLACE LISTING MODERATION
// ==========================================

const listAdminMarketplaceListings = async ({
  status,
  campusId,
  categoryId,
  condition,
  search,
  sellerUserId,
  limit = 20,
  offset = 0,
} = {}) => {
  const conditions = [];
  const params = [];

  if (status) {
    params.push(String(status).toUpperCase());
    conditions.push(`ml.status = $${params.length}`);
  }

  if (condition) {
    params.push(String(condition).toUpperCase());
    conditions.push(`ml.condition = $${params.length}`);
  }

  if (campusId) {
    appendCampusCondition(conditions, params, campusId, 'ml.campus_id');
  }

  if (categoryId) {
    params.push(String(categoryId).trim());
    conditions.push(`(ml.category_id::text = $${params.length} OR ml.subcategory_id::text = $${params.length} OR EXISTS (
      SELECT 1 FROM public.categories AS cat WHERE (cat.id = ml.category_id OR cat.id = ml.subcategory_id) AND (cat.slug = $${params.length} OR cat.legacy_key = $${params.length})
    ))`);
  }

  if (sellerUserId) {
    params.push(String(sellerUserId).trim());
    conditions.push(`ml.seller_user_id::text = $${params.length}`);
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(ml.title ILIKE $${params.length} OR ml.description ILIKE $${params.length} OR ml.seller_department ILIKE $${params.length} OR ml.seller_contact_phone ILIKE $${params.length})`);
  }

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await database.query(
    `SELECT ml.id,
            ml.legacy_key,
            ml.slug,
            ml.seller_user_id,
            ml.campus_id,
            ml.category_id,
            ml.subcategory_id,
            ml.title,
            ml.description,
            ml.price_kobo,
            ml.original_price_kobo,
            ml.condition,
            ml.status,
            ml.seller_department,
            ml.seller_contact_phone,
            ml.moderated_by,
            ml.rejection_reason,
            ml.date_listed,
            ml.date_sold,
            ml.created_at,
            ml.updated_at,
            ml.deleted_at,
            p.full_name AS seller_name,
            p.email AS seller_email,
            p.phone_number AS seller_phone,
            p.student_id AS seller_student_id,
            c.name AS campus_name,
            c.slug AS campus_slug,
            cat.name AS category_name,
            cat.slug AS category_slug,
            mod_p.full_name AS moderator_name
       FROM public.marketplace_listings AS ml
       JOIN public.profiles AS p ON p.id = ml.seller_user_id
       JOIN public.campuses AS c ON c.id = ml.campus_id
       JOIN public.categories AS cat ON cat.id = ml.category_id
  LEFT JOIN public.profiles AS mod_p ON mod_p.id = ml.moderated_by
      ${whereClause}
      ORDER BY ml.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  return result.rows;
};

const countAdminMarketplaceListings = async ({
  status,
  campusId,
  categoryId,
  condition,
  search,
  sellerUserId,
} = {}) => {
  const conditions = [];
  const params = [];

  if (status) {
    params.push(String(status).toUpperCase());
    conditions.push(`ml.status = $${params.length}`);
  }

  if (condition) {
    params.push(String(condition).toUpperCase());
    conditions.push(`ml.condition = $${params.length}`);
  }

  if (campusId) {
    appendCampusCondition(conditions, params, campusId, 'ml.campus_id');
  }

  if (categoryId) {
    params.push(String(categoryId).trim());
    conditions.push(`(ml.category_id::text = $${params.length} OR ml.subcategory_id::text = $${params.length} OR EXISTS (
      SELECT 1 FROM public.categories AS cat WHERE (cat.id = ml.category_id OR cat.id = ml.subcategory_id) AND (cat.slug = $${params.length} OR cat.legacy_key = $${params.length})
    ))`);
  }

  if (sellerUserId) {
    params.push(String(sellerUserId).trim());
    conditions.push(`ml.seller_user_id::text = $${params.length}`);
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(ml.title ILIKE $${params.length} OR ml.description ILIKE $${params.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await database.query(
    `SELECT COUNT(*)::integer AS count
       FROM public.marketplace_listings AS ml
      ${whereClause}`,
    params
  );

  return result.rows[0] ? result.rows[0].count : 0;
};

const getAdminMarketplaceListingById = async (listingId) => {
  const result = await database.query(
    `SELECT ml.id,
            ml.legacy_key,
            ml.slug,
            ml.seller_user_id,
            ml.campus_id,
            ml.category_id,
            ml.subcategory_id,
            ml.title,
            ml.description,
            ml.price_kobo,
            ml.original_price_kobo,
            ml.condition,
            ml.status,
            ml.seller_department,
            ml.seller_contact_phone,
            ml.moderated_by,
            ml.rejection_reason,
            ml.date_listed,
            ml.date_sold,
            ml.created_at,
            ml.updated_at,
            ml.deleted_at,
            p.full_name AS seller_name,
            p.email AS seller_email,
            p.phone_number AS seller_phone,
            p.student_id AS seller_student_id,
            c.name AS campus_name,
            c.slug AS campus_slug,
            cat.name AS category_name,
            cat.slug AS category_slug,
            mod_p.full_name AS moderator_name
       FROM public.marketplace_listings AS ml
       JOIN public.profiles AS p ON p.id = ml.seller_user_id
       JOIN public.campuses AS c ON c.id = ml.campus_id
       JOIN public.categories AS cat ON cat.id = ml.category_id
  LEFT JOIN public.profiles AS mod_p ON mod_p.id = ml.moderated_by
      WHERE (ml.id::text = $1 OR ml.slug = $1 OR ml.legacy_key = $1)
      LIMIT 1`,
    [listingId]
  );

  const listing = result.rows[0] || null;
  if (!listing) return null;

  const imagesRes = await database.query(
    `SELECT li.id, li.listing_id, li.image_url, li.alt_text, li.sort_order, li.is_primary, li.created_at
       FROM public.listing_images AS li
      WHERE li.listing_id = $1
      ORDER BY li.sort_order ASC`,
    [listing.id]
  );

  return {
    ...listing,
    images: imagesRes.rows,
  };
};

const moderateMarketplaceListing = async (listingId, { status, rejectionReason, moderatedBy }) => {
  const result = await database.query(
    `UPDATE public.marketplace_listings
        SET status = $1,
            rejection_reason = $2,
            moderated_by = $3,
            updated_at = NOW()
      WHERE (id::text = $4 OR slug = $4 OR legacy_key = $4)
      RETURNING id, legacy_key, slug, seller_user_id, campus_id, category_id,
                subcategory_id, title, description, price_kobo, original_price_kobo,
                condition, status, seller_department, seller_contact_phone,
                moderated_by, rejection_reason, date_listed, date_sold, created_at, updated_at`,
    [status, rejectionReason || null, moderatedBy || null, listingId]
  );

  return result.rows[0] || null;
};

// ==========================================
// 5. SERVICES MODERATION & MANAGEMENT
// ==========================================

const listAdminServices = async ({
  campusId,
  categoryId,
  search,
  isActive,
  providerUserId,
  vendorId,
  limit = 20,
  offset = 0,
} = {}) => {
  const conditions = [];
  const params = [];

  if (campusId) {
    appendCampusCondition(conditions, params, campusId, 's.campus_id');
  }

  if (categoryId) {
    params.push(String(categoryId).trim());
    conditions.push(`(s.category_id::text = $${params.length} OR s.subcategory_id::text = $${params.length} OR EXISTS (
      SELECT 1 FROM public.categories AS cat WHERE (cat.id = s.category_id OR cat.id = s.subcategory_id) AND (cat.slug = $${params.length} OR cat.legacy_key = $${params.length})
    ))`);
  }

  if (isActive !== undefined && isActive !== null && isActive !== '') {
    params.push(isActive === true || isActive === 'true');
    conditions.push(`s.is_active = $${params.length}`);
  }

  if (providerUserId) {
    params.push(String(providerUserId).trim());
    conditions.push(`s.provider_user_id::text = $${params.length}`);
  }

  if (vendorId) {
    params.push(String(vendorId).trim());
    conditions.push(`s.vendor_id::text = $${params.length}`);
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
    `SELECT s.id,
            s.legacy_key,
            s.slug,
            s.provider_user_id,
            s.vendor_id,
            s.campus_id,
            s.category_id,
            s.subcategory_id,
            s.name,
            s.description,
            s.starting_price_kobo,
            s.price_type,
            s.image_url,
            s.turnaround_time,
            s.requires_file_upload,
            s.requires_appointment,
            s.is_active,
            s.created_at,
            s.updated_at,
            p.full_name AS provider_name,
            p.email AS provider_email,
            v.name AS vendor_name,
            c.name AS campus_name,
            c.slug AS campus_slug,
            cat.name AS category_name,
            cat.slug AS category_slug,
            (SELECT COUNT(*)::integer FROM public.service_requests AS sr WHERE sr.service_id = s.id) AS request_count
       FROM public.services AS s
       JOIN public.profiles AS p ON p.id = s.provider_user_id
       JOIN public.campuses AS c ON c.id = s.campus_id
       JOIN public.categories AS cat ON cat.id = s.category_id
  LEFT JOIN public.vendors AS v ON v.id = s.vendor_id
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  return result.rows;
};

const countAdminServices = async ({
  campusId,
  categoryId,
  search,
  isActive,
  providerUserId,
  vendorId,
} = {}) => {
  const conditions = [];
  const params = [];

  if (campusId) {
    appendCampusCondition(conditions, params, campusId, 's.campus_id');
  }

  if (categoryId) {
    params.push(String(categoryId).trim());
    conditions.push(`(s.category_id::text = $${params.length} OR s.subcategory_id::text = $${params.length} OR EXISTS (
      SELECT 1 FROM public.categories AS cat WHERE (cat.id = s.category_id OR cat.id = s.subcategory_id) AND (cat.slug = $${params.length} OR cat.legacy_key = $${params.length})
    ))`);
  }

  if (isActive !== undefined && isActive !== null && isActive !== '') {
    params.push(isActive === true || isActive === 'true');
    conditions.push(`s.is_active = $${params.length}`);
  }

  if (providerUserId) {
    params.push(String(providerUserId).trim());
    conditions.push(`s.provider_user_id::text = $${params.length}`);
  }

  if (vendorId) {
    params.push(String(vendorId).trim());
    conditions.push(`s.vendor_id::text = $${params.length}`);
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(s.name ILIKE $${params.length} OR s.description ILIKE $${params.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await database.query(
    `SELECT COUNT(*)::integer AS count
       FROM public.services AS s
      ${whereClause}`,
    params
  );

  return result.rows[0] ? result.rows[0].count : 0;
};

const getAdminServiceById = async (serviceId) => {
  const result = await database.query(
    `SELECT s.id,
            s.legacy_key,
            s.slug,
            s.provider_user_id,
            s.vendor_id,
            s.campus_id,
            s.category_id,
            s.subcategory_id,
            s.name,
            s.description,
            s.starting_price_kobo,
            s.price_type,
            s.image_url,
            s.turnaround_time,
            s.requires_file_upload,
            s.requires_appointment,
            s.is_active,
            s.created_at,
            s.updated_at,
            p.full_name AS provider_name,
            p.email AS provider_email,
            v.name AS vendor_name,
            c.name AS campus_name,
            c.slug AS campus_slug,
            cat.name AS category_name,
            cat.slug AS category_slug
       FROM public.services AS s
       JOIN public.profiles AS p ON p.id = s.provider_user_id
       JOIN public.campuses AS c ON c.id = s.campus_id
       JOIN public.categories AS cat ON cat.id = s.category_id
  LEFT JOIN public.vendors AS v ON v.id = s.vendor_id
      WHERE (s.id::text = $1 OR s.slug = $1 OR s.legacy_key = $1)
      LIMIT 1`,
    [serviceId]
  );

  return result.rows[0] || null;
};

const updateAdminService = async (serviceId, fields = {}) => {
  const setClauses = [];
  const params = [];

  for (const [key, col] of [
    ['is_active', 'is_active'],
    ['isActive', 'is_active'],
    ['name', 'name'],
    ['description', 'description'],
    ['starting_price_kobo', 'starting_price_kobo'],
    ['startingPriceKobo', 'starting_price_kobo'],
    ['price_type', 'price_type'],
    ['priceType', 'price_type'],
    ['turnaround_time', 'turnaround_time'],
    ['turnaroundTime', 'turnaround_time'],
  ]) {
    if (fields[key] !== undefined && !setClauses.some((c) => c.startsWith(`${col} =`))) {
      params.push(fields[key]);
      setClauses.push(`${col} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) {
    return getAdminServiceById(serviceId);
  }

  params.push(serviceId);
  const whereIdx = params.length;

  const result = await database.query(
    `UPDATE public.services
        SET ${setClauses.join(', ')}, updated_at = NOW()
      WHERE (id::text = $${whereIdx} OR slug = $${whereIdx} OR legacy_key = $${whereIdx})
      RETURNING id, legacy_key, slug, provider_user_id, vendor_id, campus_id,
                category_id, subcategory_id, name, description, starting_price_kobo,
                price_type, image_url, turnaround_time, requires_file_upload,
                requires_appointment, is_active, created_at, updated_at`,
    params
  );

  return result.rows[0] || null;
};

// ==========================================
// 6. ORDER INSPECTION & MANAGEMENT
// ==========================================

const listAdminOrders = async ({
  status,
  orderType,
  campusId,
  vendorId,
  customerUserId,
  startDate,
  endDate,
  search,
  limit = 20,
  offset = 0,
} = {}) => {
  const conditions = [];
  const params = [];

  if (status) {
    params.push(String(status).toUpperCase());
    conditions.push(`o.status = $${params.length}`);
  }

  if (orderType) {
    params.push(String(orderType).toUpperCase());
    conditions.push(`o.type = $${params.length}`);
  }

  if (campusId) {
    appendCampusCondition(conditions, params, campusId, 'o.campus_id');
  }

  if (vendorId) {
    params.push(String(vendorId).trim());
    conditions.push(`(o.vendor_id::text = $${params.length} OR EXISTS (
      SELECT 1 FROM public.vendors AS v WHERE v.id = o.vendor_id AND (v.slug = $${params.length} OR v.legacy_key = $${params.length})
    ))`);
  }

  if (customerUserId) {
    params.push(String(customerUserId).trim());
    conditions.push(`o.user_id::text = $${params.length}`);
  }

  if (startDate) {
    params.push(startDate);
    conditions.push(`o.created_at >= $${params.length}`);
  }

  if (endDate) {
    params.push(endDate);
    conditions.push(`o.created_at <= $${params.length}`);
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(o.delivery_address ILIKE $${params.length} OR o.phone_number ILIKE $${params.length} OR o.id::text ILIKE $${params.length})`);
  }

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await database.query(
    `SELECT o.id,
            o.user_id,
            o.vendor_id,
            o.campus_id,
            o.delivery_zone_id,
            o.delivery_request_id,
            o.delivery_address,
            o.phone_number,
            o.type,
            o.subtotal_kobo,
            o.delivery_fee_kobo,
            o.service_fee_kobo,
            o.total_kobo,
            o.payment_method,
            o.payment_status,
            o.status,
            o.notes,
            o.created_at,
            o.updated_at,
            o.delivered_at,
            o.cancelled_at,
            p.full_name AS customer_name,
            p.email AS customer_email,
            v.name AS vendor_name,
            v.slug AS vendor_slug,
            c.name AS campus_name,
            c.slug AS campus_slug,
            (SELECT COUNT(*)::integer FROM public.order_items AS oi WHERE oi.order_id = o.id) AS item_count
       FROM public.orders AS o
       JOIN public.profiles AS p ON p.id = o.user_id
       JOIN public.vendors AS v ON v.id = o.vendor_id
       JOIN public.campuses AS c ON c.id = o.campus_id
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  return result.rows;
};

const countAdminOrders = async ({
  status,
  orderType,
  campusId,
  vendorId,
  customerUserId,
  startDate,
  endDate,
  search,
} = {}) => {
  const conditions = [];
  const params = [];

  if (status) {
    params.push(String(status).toUpperCase());
    conditions.push(`o.status = $${params.length}`);
  }

  if (orderType) {
    params.push(String(orderType).toUpperCase());
    conditions.push(`o.type = $${params.length}`);
  }

  if (campusId) {
    appendCampusCondition(conditions, params, campusId, 'o.campus_id');
  }

  if (vendorId) {
    params.push(String(vendorId).trim());
    conditions.push(`(o.vendor_id::text = $${params.length} OR EXISTS (
      SELECT 1 FROM public.vendors AS v WHERE v.id = o.vendor_id AND (v.slug = $${params.length} OR v.legacy_key = $${params.length})
    ))`);
  }

  if (customerUserId) {
    params.push(String(customerUserId).trim());
    conditions.push(`o.user_id::text = $${params.length}`);
  }

  if (startDate) {
    params.push(startDate);
    conditions.push(`o.created_at >= $${params.length}`);
  }

  if (endDate) {
    params.push(endDate);
    conditions.push(`o.created_at <= $${params.length}`);
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(o.delivery_address ILIKE $${params.length} OR o.phone_number ILIKE $${params.length} OR o.id::text ILIKE $${params.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await database.query(
    `SELECT COUNT(*)::integer AS count
       FROM public.orders AS o
      ${whereClause}`,
    params
  );

  return result.rows[0] ? result.rows[0].count : 0;
};

const getAdminOrderById = async (orderId) => {
  const orderRes = await database.query(
    `SELECT o.id,
            o.user_id,
            o.vendor_id,
            o.campus_id,
            o.delivery_zone_id,
            o.delivery_request_id,
            o.delivery_address,
            o.phone_number,
            o.type,
            o.subtotal_kobo,
            o.delivery_fee_kobo,
            o.service_fee_kobo,
            o.total_kobo,
            o.payment_method,
            o.payment_status,
            o.status,
            o.notes,
            o.created_at,
            o.updated_at,
            o.delivered_at,
            o.cancelled_at,
            p.full_name AS customer_name,
            p.email AS customer_email,
            p.phone_number AS customer_phone,
            p.student_id AS customer_student_id,
            v.name AS vendor_name,
            v.slug AS vendor_slug,
            v.phone_number AS vendor_phone,
            v.email AS vendor_email,
            c.name AS campus_name,
            c.slug AS campus_slug,
            dz.name AS delivery_zone_name
       FROM public.orders AS o
       JOIN public.profiles AS p ON p.id = o.user_id
       JOIN public.vendors AS v ON v.id = o.vendor_id
       JOIN public.campuses AS c ON c.id = o.campus_id
  LEFT JOIN public.delivery_zones AS dz ON dz.id = o.delivery_zone_id
      WHERE o.id = $1
      LIMIT 1`,
    [orderId]
  );

  const order = orderRes.rows[0] || null;
  if (!order) return null;

  const itemsRes = await database.query(
    `SELECT oi.id,
            oi.order_id,
            oi.product_id,
            oi.quantity,
            oi.unit_price_kobo,
            oi.total_price_kobo,
            oi.created_at,
            pr.name AS product_name,
            pr.image_url AS product_image_url
       FROM public.order_items AS oi
       JOIN public.products AS pr ON pr.id = oi.product_id
      WHERE oi.order_id = $1
      ORDER BY oi.created_at ASC`,
    [order.id]
  );

  const paymentsRes = await database.query(
    `SELECT op.id,
            op.order_id,
            op.provider,
            op.provider_reference,
            op.amount_kobo,
            op.status,
            op.paid_at,
            op.created_at
       FROM public.order_payments AS op
      WHERE op.order_id = $1
      ORDER BY op.created_at ASC`,
    [order.id]
  );

  return {
    ...order,
    items: itemsRes.rows,
    payments: paymentsRes.rows,
  };
};

const updateAdminOrderStatus = async (orderId, { status, cancelReason = null }) => {
  const updates = ['status = $1'];
  const params = [status];

  if (status === 'DELIVERED') {
    updates.push('delivered_at = NOW()');
  } else if (status === 'CANCELLED') {
    updates.push('cancelled_at = NOW()');
    if (cancelReason) {
      params.push(cancelReason);
      updates.push(`notes = COALESCE(notes || E'\\n', '') || 'Cancellation Reason: ' || $${params.length}`);
    }
  }

  params.push(orderId);
  const whereIdx = params.length;

  const result = await database.query(
    `UPDATE public.orders
        SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${whereIdx}
      RETURNING id, user_id, vendor_id, campus_id, delivery_zone_id,
                delivery_request_id, delivery_address, phone_number,
                type, subtotal_kobo, delivery_fee_kobo, service_fee_kobo,
                total_kobo, payment_method, payment_status, status,
                notes, created_at, updated_at, delivered_at, cancelled_at`,
    params
  );

  return result.rows[0] || null;
};

// ==========================================
// 7. DELIVERY INSPECTION & MANAGEMENT
// ==========================================

const listAdminDeliveries = async ({
  status,
  taskType,
  campusId,
  requesterUserId,
  riderUserId,
  limit = 20,
  offset = 0,
} = {}) => {
  const conditions = [];
  const params = [];

  if (status) {
    params.push(String(status).toUpperCase());
    conditions.push(`dr.status = $${params.length}`);
  }

  if (taskType) {
    params.push(String(taskType).toUpperCase());
    conditions.push(`dr.task_type = $${params.length}`);
  }

  if (campusId) {
    appendCampusCondition(conditions, params, campusId, 'dr.campus_id');
  }

  if (requesterUserId) {
    params.push(String(requesterUserId).trim());
    conditions.push(`dr.requester_user_id::text = $${params.length}`);
  }

  if (riderUserId) {
    params.push(String(riderUserId).trim());
    conditions.push(`dr.rider_user_id::text = $${params.length}`);
  }

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await database.query(
    `SELECT dr.id,
            dr.requester_user_id,
            dr.rider_user_id,
            dr.campus_id,
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
            dr.updated_at,
            dr.picked_up_at,
            dr.delivered_at,
            req_p.full_name AS requester_name,
            req_p.email AS requester_email,
            req_p.phone_number AS requester_phone,
            rider_p.full_name AS rider_name,
            rider_p.email AS rider_email,
            rider_p.phone_number AS rider_phone,
            c.name AS campus_name,
            c.slug AS campus_slug,
            (SELECT o.id FROM public.orders AS o WHERE o.delivery_request_id = dr.id LIMIT 1) AS related_order_id
       FROM public.delivery_requests AS dr
       JOIN public.profiles AS req_p ON req_p.id = dr.requester_user_id
       JOIN public.campuses AS c ON c.id = dr.campus_id
  LEFT JOIN public.profiles AS rider_p ON rider_p.id = dr.rider_user_id
      ${whereClause}
      ORDER BY dr.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  return result.rows;
};

const countAdminDeliveries = async ({
  status,
  taskType,
  campusId,
  requesterUserId,
  riderUserId,
} = {}) => {
  const conditions = [];
  const params = [];

  if (status) {
    params.push(String(status).toUpperCase());
    conditions.push(`dr.status = $${params.length}`);
  }

  if (taskType) {
    params.push(String(taskType).toUpperCase());
    conditions.push(`dr.task_type = $${params.length}`);
  }

  if (campusId) {
    appendCampusCondition(conditions, params, campusId, 'dr.campus_id');
  }

  if (requesterUserId) {
    params.push(String(requesterUserId).trim());
    conditions.push(`dr.requester_user_id::text = $${params.length}`);
  }

  if (riderUserId) {
    params.push(String(riderUserId).trim());
    conditions.push(`dr.rider_user_id::text = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await database.query(
    `SELECT COUNT(*)::integer AS count
       FROM public.delivery_requests AS dr
      ${whereClause}`,
    params
  );

  return result.rows[0] ? result.rows[0].count : 0;
};

const getAdminDeliveryById = async (deliveryId) => {
  const result = await database.query(
    `SELECT dr.id,
            dr.requester_user_id,
            dr.rider_user_id,
            dr.campus_id,
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
            dr.updated_at,
            dr.picked_up_at,
            dr.delivered_at,
            req_p.full_name AS requester_name,
            req_p.email AS requester_email,
            req_p.phone_number AS requester_phone,
            rider_p.full_name AS rider_name,
            rider_p.email AS rider_email,
            rider_p.phone_number AS rider_phone,
            c.name AS campus_name,
            c.slug AS campus_slug,
            (SELECT o.id FROM public.orders AS o WHERE o.delivery_request_id = dr.id LIMIT 1) AS related_order_id
       FROM public.delivery_requests AS dr
       JOIN public.profiles AS req_p ON req_p.id = dr.requester_user_id
       JOIN public.campuses AS c ON c.id = dr.campus_id
  LEFT JOIN public.profiles AS rider_p ON rider_p.id = dr.rider_user_id
      WHERE dr.id = $1
      LIMIT 1`,
    [deliveryId]
  );

  return result.rows[0] || null;
};

const updateAdminDeliveryStatus = async (deliveryId, { status, riderUserId }) => {
  const updates = ['status = $1'];
  const params = [status];

  if (status === 'PICKED_UP') {
    updates.push('picked_up_at = COALESCE(picked_up_at, NOW())');
  } else if (status === 'DELIVERED') {
    updates.push('delivered_at = NOW()');
  }

  if (riderUserId) {
    params.push(riderUserId);
    updates.push(`rider_user_id = $${params.length}`);
  }

  params.push(deliveryId);
  const whereIdx = params.length;

  const result = await database.query(
    `UPDATE public.delivery_requests
        SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${whereIdx}
      RETURNING id, requester_user_id, rider_user_id, campus_id,
                task_type, pickup_location, dropoff_location, description,
                estimated_fee_kobo, actual_fee_kobo, urgency, preferred_at,
                status, notes, created_at, updated_at, picked_up_at, delivered_at`,
    params
  );

  return result.rows[0] || null;
};

// ==========================================
// 8. USER / PROFILE MANAGEMENT & ROLE SEPARATION
// ==========================================

const listAdminUsers = async ({
  role,
  campusId,
  search,
  isActive,
  limit = 20,
  offset = 0,
} = {}) => {
  const conditions = ['p.deleted_at IS NULL'];
  const params = [];

  if (isActive !== undefined && isActive !== null && isActive !== '') {
    params.push(isActive === true || isActive === 'true');
    conditions.push(`p.is_active = $${params.length}`);
  }

  if (campusId) {
    appendCampusCondition(conditions, params, campusId, 'p.default_campus_id');
  }

  if (role) {
    params.push(String(role).toUpperCase());
    conditions.push(`EXISTS (
      SELECT 1 FROM public.user_roles AS ur
      WHERE ur.user_id = p.id AND ur.role = $${params.length}
    )`);
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(p.full_name ILIKE $${params.length} OR p.email ILIKE $${params.length} OR p.phone_number ILIKE $${params.length} OR p.student_id ILIKE $${params.length})`);
  }

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await database.query(
    `SELECT p.id,
            p.email,
            p.full_name,
            p.phone_number,
            p.profile_picture_url,
            p.bio,
            p.default_campus_id,
            p.student_id,
            p.is_active,
            p.email_verified_at,
            p.phone_verified_at,
            p.last_login_at,
            p.created_at,
            p.updated_at,
            c.name AS default_campus_name,
            c.slug AS default_campus_slug,
            COALESCE(
              (SELECT array_agg(ur.role ORDER BY ur.created_at ASC)
                 FROM public.user_roles AS ur
                WHERE ur.user_id = p.id),
              ARRAY['CUSTOMER'::public.app_role]
            ) AS roles
       FROM public.profiles AS p
  LEFT JOIN public.campuses AS c ON c.id = p.default_campus_id
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  return result.rows;
};

const countAdminUsers = async ({
  role,
  campusId,
  search,
  isActive,
} = {}) => {
  const conditions = ['p.deleted_at IS NULL'];
  const params = [];

  if (isActive !== undefined && isActive !== null && isActive !== '') {
    params.push(isActive === true || isActive === 'true');
    conditions.push(`p.is_active = $${params.length}`);
  }

  if (campusId) {
    appendCampusCondition(conditions, params, campusId, 'p.default_campus_id');
  }

  if (role) {
    params.push(String(role).toUpperCase());
    conditions.push(`EXISTS (
      SELECT 1 FROM public.user_roles AS ur
      WHERE ur.user_id = p.id AND ur.role = $${params.length}
    )`);
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(p.full_name ILIKE $${params.length} OR p.email ILIKE $${params.length} OR p.phone_number ILIKE $${params.length} OR p.student_id ILIKE $${params.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await database.query(
    `SELECT COUNT(*)::integer AS count
       FROM public.profiles AS p
      ${whereClause}`,
    params
  );

  return result.rows[0] ? result.rows[0].count : 0;
};

const getAdminUserById = async (userId) => {
  const result = await database.query(
    `SELECT p.id,
            p.email,
            p.full_name,
            p.phone_number,
            p.profile_picture_url,
            p.bio,
            p.default_campus_id,
            p.student_id,
            p.is_active,
            p.email_verified_at,
            p.phone_verified_at,
            p.last_login_at,
            p.created_at,
            p.updated_at,
            c.name AS default_campus_name,
            c.slug AS default_campus_slug,
            c.short_name AS default_campus_short_name,
            COALESCE(
              (SELECT array_agg(ur.role ORDER BY ur.created_at ASC)
                 FROM public.user_roles AS ur
                WHERE ur.user_id = p.id),
              ARRAY['CUSTOMER'::public.app_role]
            ) AS roles
       FROM public.profiles AS p
  LEFT JOIN public.campuses AS c ON c.id = p.default_campus_id
      WHERE p.id::text = $1
        AND p.deleted_at IS NULL
      LIMIT 1`,
    [userId]
  );

  const profile = result.rows[0] || null;
  if (!profile) return null;

  // Additional context: addresses, vendor entity (if any), activity counts
  const [addrRes, vendorRes, statsRes] = await Promise.all([
    database.query(
      `SELECT a.id, a.user_id, a.campus_id, a.zone_id, a.label, a.full_address, a.is_default
         FROM public.addresses AS a
        WHERE a.user_id = $1
        ORDER BY a.is_default DESC, a.created_at DESC`,
      [profile.id]
    ),
    database.query(
      `SELECT v.id, v.name, v.slug, v.status, v.is_verified
         FROM public.vendors AS v
        WHERE v.owner_user_id = $1
        LIMIT 1`,
      [profile.id]
    ),
    database.query(
      `SELECT (SELECT COUNT(*)::integer FROM public.orders WHERE user_id = $1) AS order_count,
              (SELECT COUNT(*)::integer FROM public.marketplace_listings WHERE seller_user_id = $1) AS listing_count,
              (SELECT COUNT(*)::integer FROM public.delivery_requests WHERE requester_user_id = $1) AS delivery_request_count,
              (SELECT COUNT(*)::integer FROM public.delivery_requests WHERE rider_user_id = $1) AS rider_completed_count`,
      [profile.id]
    ),
  ]);

  return {
    ...profile,
    addresses: addrRes.rows,
    vendor: vendorRes.rows[0] || null,
    stats: statsRes.rows[0] || {
      order_count: 0,
      listing_count: 0,
      delivery_request_count: 0,
      rider_completed_count: 0,
    },
  };
};

const updateAdminUserStatus = async (userId, { isActive }) => {
  const result = await database.query(
    `UPDATE public.profiles
        SET is_active = $1, updated_at = NOW()
      WHERE id::text = $2
        AND deleted_at IS NULL
      RETURNING id, email, full_name, is_active, updated_at`,
    [isActive, userId]
  );

  return result.rows[0] || null;
};

const assignUserRole = async (userId, role) => {
  await database.query(
    `INSERT INTO public.user_roles (user_id, role, created_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id, role) DO NOTHING`,
    [userId, role]
  );

  const rolesRes = await database.query(
    `SELECT role FROM public.user_roles WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId]
  );

  return rolesRes.rows.map((r) => r.role);
};

const removeUserRole = async (userId, role) => {
  await database.query(
    `DELETE FROM public.user_roles
      WHERE user_id = $1 AND role = $2`,
    [userId, role]
  );

  const rolesRes = await database.query(
    `SELECT role FROM public.user_roles WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId]
  );

  return rolesRes.rows.map((r) => r.role);
};

const setUserRoles = async (userId, roles = []) => {
  const client = await database.getClient();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM public.user_roles WHERE user_id = $1`, [userId]);
    for (const role of roles) {
      await client.query(
        `INSERT INTO public.user_roles (user_id, role, created_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id, role) DO NOTHING`,
        [userId, role]
      );
    }
    await client.query('COMMIT');

    const rolesRes = await database.query(
      `SELECT role FROM public.user_roles WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId]
    );

    return rolesRes.rows.map((r) => r.role);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  // Stats
  getDashboardStats,
  // Vendors
  listAdminVendors,
  countAdminVendors,
  getAdminVendorById,
  updateAdminVendor,
  // Products
  listAdminProducts,
  countAdminProducts,
  getAdminProductById,
  updateAdminProduct,
  deleteAdminProduct,
  // Marketplace
  listAdminMarketplaceListings,
  countAdminMarketplaceListings,
  getAdminMarketplaceListingById,
  moderateMarketplaceListing,
  // Services
  listAdminServices,
  countAdminServices,
  getAdminServiceById,
  updateAdminService,
  // Orders
  listAdminOrders,
  countAdminOrders,
  getAdminOrderById,
  updateAdminOrderStatus,
  // Deliveries
  listAdminDeliveries,
  countAdminDeliveries,
  getAdminDeliveryById,
  updateAdminDeliveryStatus,
  // Users
  listAdminUsers,
  countAdminUsers,
  getAdminUserById,
  updateAdminUserStatus,
  assignUserRole,
  removeUserRole,
  setUserRoles,
};
