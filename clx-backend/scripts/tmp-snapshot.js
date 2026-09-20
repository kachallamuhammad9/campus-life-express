// READ-ONLY snapshot of current staging data via pg + DATABASE_URL. Never prints secrets.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
const url = process.env.DATABASE_URL;
(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (sql) => (await c.query(sql)).rows;
  const j = (label, rows) => { console.log('== ' + label + ' =='); rows.forEach(r => console.log(JSON.stringify(r))); };
  j('campuses', await q("select id,slug,name,short_name from campuses order by slug"));
  j('categories', await q("select id,slug,name,parent_id,is_active from categories order by sort_order,id"));
  j('vendors', await q("select id,slug,name,status,category_id from vendors order by slug"));
  j('profiles', await q("select id,email,full_name from profiles order by email"));
  j('user_roles', await q("select user_id,role from user_roles"));
  const counts = {};
  for (const t of ['products','services','marketplace_listings','delivery_zones','vendor_campuses','vendor_operating_hours','vendor_applications']) {
    try { counts[t] = (await q(`select count(*)::int n from ${t}`))[0].n; } catch (e) { counts[t] = 'ERR ' + e.message.split('\n')[0]; }
  }
  console.log('== counts ==', JSON.stringify(counts));
  j('vendor_campuses', await q("select vendor_id,campus_id,location,is_active from vendor_campuses"));
  j('products', await q("select slug,name,vendor_id,price_kobo,is_in_stock from products order by slug"));
  j('services', await q("select slug,name,vendor_id,price_type from services order by slug"));
  j('marketplace_listings', await q("select slug,title,status,price_kobo,seller_user_id from marketplace_listings order by slug"));
  j('delivery_zones', await q("select id,name,campus_id,base_delivery_fee_kobo,is_active from delivery_zones"));
  await c.end();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
