const database = require('../config/database');

const listVendors = async ({ campusId, categoryId, search, limit = 20, offset = 0 } = {}) => {
  const conditions = ["v.status = 'ACTIVE'"];
  const params = [];

  if (campusId) {
    params.push(campusId);
    conditions.push(`EXISTS (
      SELECT 1 FROM public.vendor_campuses AS vc
      JOIN public.campuses AS c ON c.id = vc.campus_id
      WHERE vc.vendor_id = v.id
        AND vc.is_active = true
        AND c.is_active = true
        AND (c.id::text = $${params.length} OR c.slug = $${params.length} OR c.legacy_key = $${params.length})
    )`);
  }

  if (categoryId) {
    params.push(categoryId);
    conditions.push(`EXISTS (
      SELECT 1 FROM public.categories AS cat
      WHERE (cat.id = v.category_id OR cat.parent_id = v.category_id)
        AND cat.is_active = true
        AND (cat.id::text = $${params.length} OR cat.slug = $${params.length} OR cat.legacy_key = $${params.length})
    )`);
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(v.name ILIKE $${params.length} OR v.description ILIKE $${params.length} OR v.location ILIKE $${params.length})`);
  }

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await database.query(
    `SELECT v.id, v.legacy_key, v.owner_user_id, v.name, v.slug,
            v.category_id, v.location, v.phone_number, v.email,
            v.description, v.image_url, v.status, v.is_verified,
            v.rating, v.review_count, v.created_at, v.updated_at
       FROM public.vendors AS v
      ${whereClause}
      ORDER BY v.rating DESC, v.name ASC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  return result.rows;
};

const getVendorByIdentifier = async (identifier) => {
  const result = await database.query(
    `SELECT v.id, v.legacy_key, v.owner_user_id, v.name, v.slug,
            v.category_id, v.location, v.phone_number, v.email,
            v.description, v.image_url, v.status, v.is_verified,
            v.rating, v.review_count, v.created_at, v.updated_at
       FROM public.vendors AS v
      WHERE v.status = 'ACTIVE'
        AND (v.id::text = $1 OR v.slug = $1 OR v.legacy_key = $1)
      LIMIT 1`,
    [identifier]
  );

  return result.rows[0] || null;
};

const getVendorCampuses = async (vendorId) => {
  const result = await database.query(
    `SELECT vc.vendor_id, vc.campus_id, vc.location, vc.is_active,
            c.name AS campus_name, c.slug AS campus_slug, c.short_name AS campus_short_name
       FROM public.vendor_campuses AS vc
       JOIN public.campuses AS c ON c.id = vc.campus_id
      WHERE vc.vendor_id = $1
        AND vc.is_active = true
        AND c.is_active = true
      ORDER BY c.name ASC`,
    [vendorId]
  );

  return result.rows;
};

const getVendorOperatingHours = async (vendorId) => {
  const result = await database.query(
    `SELECT voh.id, voh.vendor_id, voh.campus_id, voh.day_of_week,
            voh.opens_at, voh.closes_at, voh.is_closed,
            voh.created_at, voh.updated_at
       FROM public.vendor_operating_hours AS voh
      WHERE voh.vendor_id = $1
      ORDER BY voh.day_of_week ASC`,
    [vendorId]
  );

  return result.rows;
};

const getVendorProducts = async (vendorId, { limit = 50, offset = 0 } = {}) => {
  const result = await database.query(
    `SELECT p.id, p.legacy_key, p.slug, p.vendor_id, p.campus_id,
            p.category_id, p.subcategory_id, p.name, p.description,
            p.price_kobo, p.original_price_kobo, p.image_url,
            p.rating, p.review_count, p.is_popular, p.is_in_stock,
            p.stock_quantity, p.created_at, p.updated_at
       FROM public.products AS p
      WHERE p.vendor_id = $1
        AND p.is_in_stock = true
      ORDER BY p.is_popular DESC, p.name ASC, p.created_at DESC
      LIMIT $2 OFFSET $3`,
    [vendorId, limit, offset]
  );

  return result.rows;
};

const getVendorReviews = async (vendorId, { limit = 50, offset = 0 } = {}) => {
  const result = await database.query(
    `SELECT vr.id, vr.vendor_id, vr.reviewer_user_id, vr.order_id,
            vr.rating, vr.comment, vr.created_at, vr.updated_at,
            p.full_name AS reviewer_name, p.profile_picture_url AS reviewer_avatar_url
       FROM public.vendor_reviews AS vr
       LEFT JOIN public.profiles AS p ON p.id = vr.reviewer_user_id
      WHERE vr.vendor_id = $1
      ORDER BY vr.created_at DESC
      LIMIT $2 OFFSET $3`,
    [vendorId, limit, offset]
  );

  return result.rows;
};

module.exports = {
  listVendors,
  getVendorByIdentifier,
  getVendorCampuses,
  getVendorOperatingHours,
  getVendorProducts,
  getVendorReviews,
};
