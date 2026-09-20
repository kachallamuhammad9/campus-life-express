require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const tables = [
  'campuses', 'categories', 'vendors', 'products', 'services', 'marketplace_listings',
  'delivery_zones', 'vendor_applications', 'profiles', 'roles', 'product_categories',
  'service_categories', 'operating_hours', 'vendor_campuses', 'user_roles', 'profiles_sellers'
];
(async () => {
  const { rows } = await pool.query(`select table_name from information_schema.tables where table_schema='public' order by 1`);
  console.log('TABLES:', rows.map(r => r.table_name).join(', '));
  for (const t of tables) {
    if (!rows.some(r => r.table_name === t)) { console.log(t, ': (missing)'); continue; }
    try { const c = await pool.query(`select count(*)::int n from public.${t}`); console.log(t, ':', c.rows[0].n); }
    catch (e) { console.log(t, ': ERR', e.message); }
  }
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
