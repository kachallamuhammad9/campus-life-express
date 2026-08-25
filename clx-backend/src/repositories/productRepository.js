const database = require('../config/database');

const listProducts = async ({
  campusId,
  vendorId,
  categoryId,
  search,
  minPrice,
  maxPrice,
  inStock,
  limit = 20,
  offset = 0,
} = {}) => {
  const conditions = [
    "v.status = 'ACTIVE'",
    'c.is_active = true',
  ];
  const params = [];

  if (campusId) {
    params.push(campusId);
    conditions.push(`(c.id::text = $${params.length} OR c.slug = $${params.length} OR c.legacy_key = $${params.length})`);
  }

  if (vendorId) {
    params.push(vendorId);
    conditions.push(`(v.id::text = $${params.length} OR v.slug = $${params.length} OR v.legacy_key = $${params.length})`);
  }

  if (categoryId) {
    params.push(categoryId);
    conditions.push(`EXISTS (
      SELECT 1 FROM public.categories AS cat
      WHERE (cat.id = p.category_id OR cat.id = p.subcategory_id OR cat.parent_id = p.category_id)
        AND cat.is_active = true
        AND (cat.id::text = $${params.length} OR cat.slug = $${params.length} OR cat.legacy_key = $${params.length})
    )`);
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`);
  }

  if (minPrice !== undefined && minPrice !== null) {
    params.push(minPrice);
    conditions.push(`p.price_kobo >= $${params.length}`);
  }

  if (maxPrice !== undefined && maxPrice !== null) {
    params.push(maxPrice);
    conditions.push(`p.price_kobo <= $${params.length}`);
  }

  if (inStock !== undefined && inStock !== null) {
    params.push(Boolean(inStock));
    conditions.push(`p.is_in_stock = $${params.length}`);
  }

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await database.query(
    `SELECT p.id, p.legacy_key, p.slug, p.vendor_id, p.campus_id,
            p.category_id, p.subcategory_id, p.name, p.description,
            p.price_kobo, p.original_price_kobo, p.image_url,
            p.rating, p.review_count, p.is_popular, p.is_in_stock,
            p.stock_quantity, p.created_at, p.updated_at,
            v.name AS vendor_name, v.slug AS vendor_slug,
            c.name AS campus_name, c.slug AS campus_slug
       FROM public.products AS p
       JOIN public.vendors AS v ON v.id = p.vendor_id
       JOIN public.campuses AS c ON c.id = p.campus_id
      ${whereClause}
      ORDER BY p.is_popular DESC, p.rating DESC, p.name ASC, p.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  return result.rows;
};

const getProductByIdentifier = async (identifier) => {
  const result = await database.query(
    `SELECT p.id, p.legacy_key, p.slug, p.vendor_id, p.campus_id,
            p.category_id, p.subcategory_id, p.name, p.description,
            p.price_kobo, p.original_price_kobo, p.image_url,
            p.rating, p.review_count, p.is_popular, p.is_in_stock,
            p.stock_quantity, p.created_at, p.updated_at,
            v.name AS vendor_name, v.slug AS vendor_slug,
            c.name AS campus_name, c.slug AS campus_slug,
            cat.name AS category_name, cat.slug AS category_slug
       FROM public.products AS p
       JOIN public.vendors AS v ON v.id = p.vendor_id
       JOIN public.campuses AS c ON c.id = p.campus_id
       LEFT JOIN public.categories AS cat ON cat.id = p.category_id
      WHERE v.status = 'ACTIVE'
        AND c.is_active = true
        AND (p.id::text = $1 OR p.slug = $1 OR p.legacy_key = $1)
      LIMIT 1`,
    [identifier]
  );

  return result.rows[0] || null;
};

const getProductImages = async (productId) => {
  const result = await database.query(
    `SELECT pi.id, pi.product_id, pi.image_url, pi.alt_text,
            pi.sort_order, pi.is_primary, pi.created_at
       FROM public.product_images AS pi
      WHERE pi.product_id = $1
      ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.created_at ASC`,
    [productId]
  );

  return result.rows;
};

const getProductReviews = async (productId, { limit = 50, offset = 0 } = {}) => {
  const result = await database.query(
    `SELECT pr.id, pr.product_id, pr.reviewer_user_id, pr.order_id,
            pr.rating, pr.comment, pr.created_at, pr.updated_at,
            prof.full_name AS reviewer_name, prof.profile_picture_url AS reviewer_avatar_url
       FROM public.product_reviews AS pr
       LEFT JOIN public.profiles AS prof ON prof.id = pr.reviewer_user_id
      WHERE pr.product_id = $1
      ORDER BY pr.created_at DESC
      LIMIT $2 OFFSET $3`,
    [productId, limit, offset]
  );

  return result.rows;
};

module.exports = {
  listProducts,
  getProductByIdentifier,
  getProductImages,
  getProductReviews,
};
