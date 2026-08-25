const database = require('../config/database');

const getActiveCampuses = async () => {
  const result = await database.query(
    `SELECT id, legacy_key, slug, name, short_name, location, description,
            latitude, longitude, is_active, created_at, updated_at
       FROM public.campuses
      WHERE is_active = true
      ORDER BY name ASC`,
    []
  );

  return result.rows;
};

const getCampusByIdentifier = async (identifier) => {
  const result = await database.query(
    `SELECT id, legacy_key, slug, name, short_name, location, description,
            latitude, longitude, is_active, created_at, updated_at
       FROM public.campuses
      WHERE is_active = true
        AND (id::text = $1 OR slug = $1 OR legacy_key = $1)
      LIMIT 1`,
    [identifier]
  );

  return result.rows[0] || null;
};

module.exports = {
  getActiveCampuses,
  getCampusByIdentifier,
};
