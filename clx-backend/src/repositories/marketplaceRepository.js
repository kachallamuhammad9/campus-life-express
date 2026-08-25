const database = require('../config/database');

const listListings = async ({
  campusId,
  categoryId,
  search,
  minPrice,
  maxPrice,
  condition,
  status = 'PUBLISHED',
  limit = 20,
  offset = 0,
} = {}) => {
  const conditions = [
    'm.deleted_at IS NULL',
    'c.is_active = true',
  ];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`m.status = $${params.length}`);
  }

  if (campusId) {
    params.push(campusId);
    conditions.push(`(c.id::text = $${params.length} OR c.slug = $${params.length} OR c.legacy_key = $${params.length})`);
  }

  if (categoryId) {
    params.push(categoryId);
    conditions.push(`EXISTS (
      SELECT 1 FROM public.categories AS cat
      WHERE (cat.id = m.category_id OR cat.id = m.subcategory_id OR cat.parent_id = m.category_id)
        AND cat.is_active = true
        AND (cat.id::text = $${params.length} OR cat.slug = $${params.length} OR cat.legacy_key = $${params.length})
    )`);
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(m.title ILIKE $${params.length} OR m.description ILIKE $${params.length})`);
  }

  if (minPrice !== undefined && minPrice !== null) {
    params.push(minPrice);
    conditions.push(`m.price_kobo >= $${params.length}`);
  }

  if (maxPrice !== undefined && maxPrice !== null) {
    params.push(maxPrice);
    conditions.push(`m.price_kobo <= $${params.length}`);
  }

  if (condition) {
    params.push(condition);
    conditions.push(`m.condition = $${params.length}`);
  }

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await database.query(
    `SELECT m.id, m.legacy_key, m.slug, m.seller_user_id, m.campus_id,
            m.category_id, m.subcategory_id, m.title, m.description,
            m.price_kobo, m.original_price_kobo, m.condition, m.status,
            m.seller_department, m.seller_contact_phone, m.date_listed,
            m.date_sold, m.created_at, m.updated_at,
            c.name AS campus_name, c.slug AS campus_slug,
            cat.name AS category_name, cat.slug AS category_slug,
            prof.full_name AS seller_name, prof.profile_picture_url AS seller_avatar_url,
            (
              SELECT li.image_url
                FROM public.listing_images AS li
               WHERE li.listing_id = m.id
               ORDER BY li.is_primary DESC, li.sort_order ASC, li.created_at ASC
               LIMIT 1
            ) AS primary_image_url
       FROM public.marketplace_listings AS m
       JOIN public.campuses AS c ON c.id = m.campus_id
       JOIN public.categories AS cat ON cat.id = m.category_id
       LEFT JOIN public.profiles AS prof ON prof.id = m.seller_user_id
      ${whereClause}
      ORDER BY m.date_listed DESC, m.title ASC, m.id ASC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  return result.rows;
};

const getListingByIdentifier = async (identifier) => {
  const result = await database.query(
    `SELECT m.id, m.legacy_key, m.slug, m.seller_user_id, m.campus_id,
            m.category_id, m.subcategory_id, m.title, m.description,
            m.price_kobo, m.original_price_kobo, m.condition, m.status,
            m.seller_department, m.seller_contact_phone, m.date_listed,
            m.date_sold, m.created_at, m.updated_at, m.deleted_at,
            c.name AS campus_name, c.slug AS campus_slug, c.is_active AS campus_is_active,
            cat.name AS category_name, cat.slug AS category_slug,
            prof.full_name AS seller_name, prof.profile_picture_url AS seller_avatar_url
       FROM public.marketplace_listings AS m
       JOIN public.campuses AS c ON c.id = m.campus_id
       JOIN public.categories AS cat ON cat.id = m.category_id
       LEFT JOIN public.profiles AS prof ON prof.id = m.seller_user_id
      WHERE (m.id::text = $1 OR m.slug = $1 OR m.legacy_key = $1)
      LIMIT 1`,
    [identifier]
  );

  return result.rows[0] || null;
};

const getListingImages = async (listingId) => {
  const result = await database.query(
    `SELECT li.id, li.listing_id, li.image_url, li.alt_text,
            li.sort_order, li.is_primary, li.created_at
       FROM public.listing_images AS li
      WHERE li.listing_id = $1
      ORDER BY li.is_primary DESC, li.sort_order ASC, li.created_at ASC`,
    [listingId]
  );

  return result.rows;
};

const createListing = async ({
  legacyKey = null,
  slug,
  sellerUserId,
  campusId,
  categoryId,
  subcategoryId = null,
  title,
  description = null,
  priceKobo,
  originalPriceKobo = null,
  condition,
  status = 'PENDING_REVIEW',
  sellerDepartment = null,
  sellerContactPhone = null,
}) => {
  const result = await database.query(
    `INSERT INTO public.marketplace_listings (
       legacy_key,
       slug,
       seller_user_id,
       campus_id,
       category_id,
       subcategory_id,
       title,
       description,
       price_kobo,
       original_price_kobo,
       condition,
       status,
       seller_department,
       seller_contact_phone,
       date_listed
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
     RETURNING id, legacy_key, slug, seller_user_id, campus_id,
               category_id, subcategory_id, title, description,
               price_kobo, original_price_kobo, condition, status,
               seller_department, seller_contact_phone, date_listed,
               date_sold, created_at, updated_at`,
    [
      legacyKey,
      slug,
      sellerUserId,
      campusId,
      categoryId,
      subcategoryId,
      title,
      description,
      priceKobo,
      originalPriceKobo,
      condition,
      status,
      sellerDepartment,
      sellerContactPhone,
    ]
  );

  return result.rows[0];
};

const createListingImages = async (listingId, images = []) => {
  if (!images || images.length === 0) {
    return [];
  }

  const insertedImages = [];
  for (let i = 0; i < images.length; i += 1) {
    const img = images[i];
    const imageUrl = typeof img === 'string' ? img : img.imageUrl || img.image_url;
    const altText = typeof img === 'object' ? (img.altText || img.alt_text || null) : null;
    const sortOrder = typeof img === 'object' && Number.isInteger(img.sortOrder || img.sort_order)
      ? (img.sortOrder || img.sort_order)
      : i;
    const isPrimary = typeof img === 'object' && Boolean(img.isPrimary || img.is_primary);

    if (imageUrl && typeof imageUrl === 'string') {
      const result = await database.query(
        `INSERT INTO public.listing_images (
           listing_id,
           image_url,
           alt_text,
           sort_order,
           is_primary
         ) VALUES ($1, $2, $3, $4, $5)
         RETURNING id, listing_id, image_url, alt_text, sort_order, is_primary, created_at`,
        [listingId, imageUrl.trim(), altText, sortOrder, isPrimary]
      );
      if (result.rows[0]) {
        insertedImages.push(result.rows[0]);
      }
    }
  }

  return insertedImages;
};

const updateListing = async (listingId, updateFields = {}) => {
  const allowedFields = {
    title: 'title',
    description: 'description',
    price_kobo: 'price_kobo',
    original_price_kobo: 'original_price_kobo',
    condition: 'condition',
    seller_department: 'seller_department',
    seller_contact_phone: 'seller_contact_phone',
    status: 'status',
    date_sold: 'date_sold',
  };

  const setClauses = [];
  const params = [listingId];

  for (const [key, dbColumn] of Object.entries(allowedFields)) {
    if (Object.prototype.hasOwnProperty.call(updateFields, key)) {
      params.push(updateFields[key]);
      setClauses.push(`${dbColumn} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) {
    return null;
  }

  setClauses.push('updated_at = now()');

  const result = await database.query(
    `UPDATE public.marketplace_listings
        SET ${setClauses.join(', ')}
      WHERE id::text = $1
        AND deleted_at IS NULL
      RETURNING id, legacy_key, slug, seller_user_id, campus_id,
                category_id, subcategory_id, title, description,
                price_kobo, original_price_kobo, condition, status,
                seller_department, seller_contact_phone, date_listed,
                date_sold, created_at, updated_at`,
    params
  );

  return result.rows[0] || null;
};

const softDeleteListing = async (listingId) => {
  const result = await database.query(
    `UPDATE public.marketplace_listings
        SET deleted_at = now(),
            status = 'REMOVED',
            updated_at = now()
      WHERE id::text = $1
        AND deleted_at IS NULL
      RETURNING id, status, deleted_at, updated_at`,
    [listingId]
  );

  return result.rows[0] || null;
};

module.exports = {
  listListings,
  getListingByIdentifier,
  getListingImages,
  createListing,
  createListingImages,
  updateListing,
  softDeleteListing,
};
