const database = require('../config/database');

const getActiveRootCategories = async () => {
  const result = await database.query(
    `SELECT id, legacy_key, parent_id, slug, name, description, icon,
            image_url, sort_order, is_active, created_at, updated_at
       FROM public.categories
      WHERE parent_id IS NULL
        AND is_active = true
      ORDER BY sort_order ASC, name ASC`,
    []
  );

  return result.rows;
};

const getActiveCategories = async () => {
  const result = await database.query(
        `SELECT child.id, child.legacy_key, child.parent_id, child.slug,
          child.name, child.description, child.icon, child.image_url,
          child.sort_order, child.is_active, child.created_at, child.updated_at
        FROM public.categories AS child
        LEFT JOIN public.categories AS parent ON parent.id = child.parent_id
       WHERE child.is_active = true
       ORDER BY CASE WHEN child.parent_id IS NULL
            THEN child.sort_order
            ELSE parent.sort_order
          END ASC,
          CASE WHEN child.parent_id IS NULL THEN 0 ELSE 1 END ASC,
          child.sort_order ASC,
          child.name ASC`,
    []
  );

  return result.rows;
};

const getCategoryByIdentifier = async (identifier) => {
  const result = await database.query(
    `SELECT id, legacy_key, parent_id, slug, name, description, icon,
            image_url, sort_order, is_active, created_at, updated_at
       FROM public.categories
      WHERE is_active = true
        AND (id::text = $1 OR slug = $1 OR legacy_key = $1)
      LIMIT 1`,
    [identifier]
  );

  return result.rows[0] || null;
};

module.exports = {
  getActiveRootCategories,
  getActiveCategories,
  getCategoryByIdentifier,
};
