const { Client } = require('pg');
require('dotenv').config();
(async () => {
  const u = new URL(process.env.DATABASE_URL);
  const db = new Client({
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    host: u.hostname,
    port: +(u.port || 5432),
    database: u.pathname.replace('/', ''),
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();

  // 1. Project identity
  console.log('host:', u.hostname, '| db:', u.pathname);

  // 2. Do the user's listed IDs exist anywhere?
  const ids = ['e88c5587', '2070b9a5', 'a6319788', '5424e324', '0601e5bb', '422d4a96', '3bfcf7a3', '94905e08', '56094f7a', '29abc249'];
  for (const p of ids) {
    const r = await db.query("select id::text, business_name, status from vendor_applications where id::text like $1", [p + '%']);
    console.log(p, r.rows.length ? r.rows : 'NOT FOUND');
  }

  // 3. Any other Smoke Test records (any status / with vendor)?
  const all = await db.query("select id::text, status, vendor_id, created_at from vendor_applications where business_name='Smoke Test Demo Vendor' order by created_at");
  console.log('all Smoke Test Demo Vendor applications: ' + all.rows.length);
  all.rows.forEach(r => console.log(' ', r.id, r.status, r.vendor_id, r.created_at));

  // 4. Marketplace listings
  const ml = await db.query("select id::text, title, status, created_at from marketplace_listings where id::text in ('e3344af9-b928-4194-ad7e-ba4fcf9a1b59','ea592281-29ea-47e0-a82a-6efc5c63783c')");
  console.log('target listings:', ml.rows);
  const mls = await db.query("select count(*) from marketplace_listings");
  console.log('total marketplace_listings:', mls.rows[0].count);

  // 5. Baseline counts
  for (const t of ['campuses', 'categories', 'vendors', 'products', 'services', 'delivery_zones', 'profiles', 'user_roles']) {
    const r = await db.query('select count(*) from ' + t);
    console.log(t, r.rows[0].count);
  }

  // 6. Any smoke-test vendors created?
  const sv = await db.query("select id::text, name, status from vendors where name ilike '%smoke%' or slug like '%smoke%'");
  console.log('smoke vendors:', sv.rows);

  await db.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
