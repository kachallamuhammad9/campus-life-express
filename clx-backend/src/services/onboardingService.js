const database = require('../config/database');
const { AppError } = require('../utils/AppError');

const slugify = (text) => String(text || '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const createVendorApplication = async (data = {}) => {
  const businessName = String(data.businessName || data.business_name || '').trim();
  const categorySlug = String(data.categorySlug || data.category_slug || '').trim();
  const campusSlug = String(data.campusSlug || data.campus_slug || '').trim();
  const location = String(data.location || '').trim();
  const contactName = String(data.contactName || data.contact_name || '').trim();

  if (businessName.length < 2 || businessName.length > 255) {
    throw new AppError(400, 'VALIDATION_ERROR', 'businessName is required (2-255 characters)');
  }
  if (!categorySlug) throw new AppError(400, 'VALIDATION_ERROR', 'categorySlug is required');
  if (!campusSlug) throw new AppError(400, 'VALIDATION_ERROR', 'campusSlug is required');
  if (!location) throw new AppError(400, 'VALIDATION_ERROR', 'location is required');
  if (contactName.length < 2) throw new AppError(400, 'VALIDATION_ERROR', 'contactName is required');

  // Validate category + campus exist (fail fast with clear errors)
  const catRes = await database.query('SELECT id FROM public.categories WHERE slug = $1 AND is_active = true LIMIT 1', [categorySlug]);
  if (!catRes.rows[0]) throw new AppError(400, 'INVALID_CATEGORY', `Category "${categorySlug}" was not found`);
  const camRes = await database.query('SELECT id FROM public.campuses WHERE slug = $1 AND is_active = true LIMIT 1', [campusSlug]);
  if (!camRes.rows[0]) throw new AppError(400, 'INVALID_CAMPUS', `Campus "${campusSlug}" was not found`);

  const slug = `${slugify(businessName)}-${Date.now().toString(36)}`;
  const legacyKey = `demo-app:${slug}`;

  // Idempotent on duplicate business name + campus (unique slug collision is impossible due to timestamp suffix,
  // but we skip if the same legacy_key already exists)
  const existing = await database.query('SELECT id FROM public.vendor_applications WHERE legacy_key = $1 LIMIT 1', [legacyKey]);
  if (existing.rows[0]) {
    return { ...existing.rows[0], duplicate: true };
  }

  const result = await database.query(
    `INSERT INTO public.vendor_applications
       (legacy_key, business_name, slug, category_slug, campus_slug, location,
        contact_name, phone_number, email, description, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING')
     RETURNING id, slug, business_name, status, created_at`,
    [legacyKey, businessName, slug, categorySlug, campusSlug, location,
      contactName, data.phoneNumber || data.phone_number || null,
      data.email || null, data.description || null]
  );
  return result.rows[0];
};

const listVendorApplications = async ({ status, limit = 20, offset = 0 } = {}) => {
  const conditions = [];
  const params = [];
  if (status) {
    const s = String(status).toUpperCase();
    if (!['PENDING', 'APPROVED', 'REJECTED'].includes(s)) {
      throw new AppError(400, 'INVALID_STATUS', 'status must be PENDING, APPROVED, or REJECTED');
    }
    params.push(s);
    conditions.push(`status = $${params.length}`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit); const limitIdx = params.length;
  params.push(offset); const offsetIdx = params.length;
  const result = await database.query(
    `SELECT * FROM public.vendor_applications ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );
  return result.rows;
};

const reviewVendorApplication = async (applicationId, reviewData = {}, adminUser) => {
  const action = String(reviewData.action || reviewData.status || '').toUpperCase().trim();
  if (!['APPROVE', 'REJECT'].includes(action)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'action must be APPROVE or REJECT');
  }
  const rejectionReason = reviewData.rejectionReason || reviewData.rejection_reason || null;
  if (action === 'REJECT' && (!rejectionReason || !String(rejectionReason).trim())) {
    throw new AppError(400, 'VALIDATION_ERROR', 'rejectionReason is required when rejecting');
  }

  const existing = await database.query('SELECT * FROM public.vendor_applications WHERE id::text = $1', [applicationId]);
  const app = existing.rows[0];
  if (!app) throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Vendor application was not found');
  if (app.status !== 'PENDING') {
    throw new AppError(409, 'ALREADY_REVIEWED', `Application is already ${app.status}`);
  }

  if (action === 'REJECT') {
    const updated = await database.query(
      `UPDATE public.vendor_applications
          SET status = 'REJECTED', rejection_reason = $1, reviewed_by = $2, updated_at = now()
        WHERE id = $3 RETURNING *`,
      [String(rejectionReason).trim(), adminUser.id, app.id]
    );
    return updated.rows[0];
  }

  // APPROVE -> create the vendor
  return database.withTransaction(async (client) => {
    const camRes = await client.query('SELECT id FROM public.campuses WHERE slug = $1 LIMIT 1', [app.campus_slug]);
    const catRes = await client.query('SELECT id FROM public.categories WHERE slug = $1 LIMIT 1', [app.category_slug]);
    if (!camRes.rows[0] || !catRes.rows[0]) throw new AppError(400, 'INVALID_REFERENCE', 'Campus or category no longer exists');

    const ownerRes = await client.query(
      `SELECT id FROM public.profiles
        WHERE email = $1 AND deleted_at IS NULL LIMIT 1`,
      [`${app.slug}@applications.clx.local`]
    );
    // Vendor requires owner_user_id referencing profiles — reuse a deterministic
    // demo admin-owned profile for demo applications (no new auth user created).
    const ownerProfile = ownerRes.rows[0]
      ? ownerRes.rows[0]
      : (await client.query(`SELECT id FROM public.profiles WHERE email = 'e2e.admin@campuslife.express' LIMIT 1`)).rows[0];
    if (!ownerProfile) throw new AppError(500, 'OWNER_PROFILE_MISSING', 'No owner profile available');

    const vendorRes = await client.query(
      `INSERT INTO public.vendors
         (legacy_key, owner_user_id, name, slug, category_id, location,
          phone_number, email, description, status, is_verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ACTIVE',false)
       ON CONFLICT (legacy_key) DO NOTHING
       RETURNING id, slug, name, status`,
      [`demo-vendor:${app.slug}`, ownerProfile.id, app.business_name,
      `${slugify(app.business_name)}-${app.slug.slice(-6)}`, catRes.rows[0].id,
      app.location, app.phone_number, app.email, app.description]
    );
    let vendor = vendorRes.rows[0];
    if (!vendor) {
      const existingVendor = await client.query('SELECT id, slug, name, status FROM public.vendors WHERE legacy_key = $1', [`demo-vendor:${app.slug}`]);
      vendor = existingVendor.rows[0];
    }
    if (!vendor) throw new AppError(500, 'VENDOR_CREATE_FAILED', 'Vendor could not be created');

    await client.query(
      `INSERT INTO public.vendor_campuses (vendor_id, campus_id, location, is_active)
       VALUES ($1,$2,$3,true)
       ON CONFLICT (vendor_id, campus_id) DO NOTHING`,
      [vendor.id, camRes.rows[0].id, app.location]
    );

    const updated = await client.query(
      `UPDATE public.vendor_applications
          SET status = 'APPROVED', vendor_id = $1, reviewed_by = $2, updated_at = now()
        WHERE id = $3 RETURNING *`,
      [vendor.id, adminUser.id, app.id]
    );
    return { application: updated.rows[0], vendor };
  });
};

module.exports = {
  createVendorApplication,
  listVendorApplications,
  reviewVendorApplication,
};
