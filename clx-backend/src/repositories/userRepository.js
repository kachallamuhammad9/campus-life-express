const database = require('../config/database');

/**
 * User and Profile Repository
 * Handles direct database access for profiles and user roles
 */

const getUserProfileById = async (userId) => {
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
            c.short_name AS default_campus_short_name
       FROM public.profiles AS p
  LEFT JOIN public.campuses AS c ON c.id = p.default_campus_id
      WHERE p.id::text = $1
        AND p.deleted_at IS NULL
      LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
};

const getUserProfileByEmail = async (email) => {
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
            c.short_name AS default_campus_short_name
       FROM public.profiles AS p
  LEFT JOIN public.campuses AS c ON c.id = p.default_campus_id
      WHERE LOWER(p.email) = LOWER($1)
        AND p.deleted_at IS NULL
      LIMIT 1`,
    [email]
  );

  return result.rows[0] || null;
};

const getUserByCredentials = async (email, password) => {
  const result = await database.query(
    `SELECT id, email
       FROM auth.users
      WHERE LOWER(email) = LOWER($1)
        AND deleted_at IS NULL
        AND encrypted_password IS NOT NULL
        AND crypt($2, encrypted_password) = encrypted_password
      LIMIT 1`,
    [email, password]
  );

  return result.rows[0] || null;
};

const createUserAccount = async ({ email, password, fullName, phoneNumber, campusId }) => {
  return database.withTransaction(async (client) => {
    const campusResult = await client.query(
      `SELECT id
         FROM public.campuses
        WHERE is_active = true
          AND (id::text = $1 OR slug = $1 OR legacy_key = $1)
        LIMIT 1`,
      [campusId || 'unimaid']
    );
    const campus = campusResult.rows[0];
    if (!campus) {
      const error = new Error('Selected campus was not found');
      error.code = 'INVALID_CAMPUS';
      throw error;
    }

    const userResult = await client.query(
      `INSERT INTO auth.users (
         id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at
       ) VALUES (
         gen_random_uuid(), 'authenticated', 'authenticated', $1,
         crypt($2, gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}'::jsonb,
         jsonb_build_object('full_name', $3::text), now(), now()
       )
       RETURNING id, email`,
      [email, password, fullName]
    );
    const user = userResult.rows[0];

    await client.query(
      `INSERT INTO public.profiles (id, email, full_name, phone_number, default_campus_id, is_active)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [user.id, user.email, fullName, phoneNumber || null, campus.id]
    );

    await client.query(
      `INSERT INTO public.user_roles (user_id, role)
       VALUES ($1, 'CUSTOMER')`,
      [user.id]
    );

    return user;
  });
};

const getUserRoles = async (userId) => {
  const result = await database.query(
    `SELECT role
       FROM public.user_roles
      WHERE user_id::text = $1
      ORDER BY created_at ASC`,
    [userId]
  );

  return result.rows.map((row) => row.role);
};

module.exports = {
  getUserProfileById,
  getUserProfileByEmail,
  getUserByCredentials,
  createUserAccount,
  getUserRoles,
};
