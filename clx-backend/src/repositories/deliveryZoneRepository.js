const database = require('../config/database');

const getActiveDeliveryZonesByCampus = async (campusIdentifier) => {
  const result = await database.query(
    `SELECT dz.id, dz.campus_id, dz.name, dz.description,
            dz.base_delivery_fee_kobo, dz.is_active, dz.created_at, dz.updated_at
       FROM public.delivery_zones AS dz
       JOIN public.campuses AS c ON c.id = dz.campus_id
      WHERE dz.is_active = true
        AND c.is_active = true
        AND (c.id::text = $1 OR c.slug = $1 OR c.legacy_key = $1)
      ORDER BY dz.name ASC`,
    [campusIdentifier]
  );

  return result.rows;
};

module.exports = {
  getActiveDeliveryZonesByCampus,
};
