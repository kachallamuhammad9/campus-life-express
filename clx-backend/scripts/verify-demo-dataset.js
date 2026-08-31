/* Read-only verification of demo dataset counts + relationships (staging). */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
const u = new URL(process.env.DATABASE_URL);
const db = new Client({
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  host: u.hostname, port: +(u.port || 5432), database: u.pathname.replace(/^\//, ''),
  ssl: { rejectUnauthorized: false },
});
(async () => {
  await db.connect();
  const tables = ['campuses', 'categories', 'vendors', 'vendor_campuses', 'vendor_operating_hours', 'products', 'services', 'marketplace_listings', 'delivery_zones', 'profiles', 'user_roles'];
  for (const t of tables) {
    const r = await db.query(`select count(*)::int c from ${t}`);
    console.log(t.padEnd(24), r.rows[0].c);
  }
  const checks = [
    ['demo products w/ orphan vendor', `select count(*)::int c from products p left join vendors v on p.vendor_id=v.id where v.id is null and p.slug like 'demo-%'`],
    ['demo listings w/ orphan seller', `select count(*)::int c from marketplace_listings l left join profiles pr on l.seller_user_id=pr.id where pr.id is null and l.slug like 'demo-%'`],
    ['vendor_campus orphan campuses', `select count(*)::int c from vendor_campuses vc left join campuses c on vc.campus_id=c.id where c.id is null`],
    ['demo services w/ orphan vendor', `select count(*)::int c from services s left join vendors v on s.vendor_id=v.id where v.id is null and s.slug like 'demo-%'`],
    ['demo products w/ orphan category', `select count(*)::int c from products p left join categories cat on p.category_id=cat.id where cat.id is null and p.slug like 'demo-%'`],
    ['demo listings w/ orphan campus', `select count(*)::int c from marketplace_listings l left join campuses c on l.campus_id=c.id where c.id is null and l.slug like 'demo-%'`],
    ['demo listings w/ orphan category', `select count(*)::int c from marketplace_listings l left join categories cat on l.category_id=cat.id where cat.id is null and l.slug like 'demo-%'`],
    ['operating hours orphan vendors', `select count(*)::int c from vendor_operating_hours h left join vendors v on h.vendor_id=v.id where v.id is null`],
  ];
  console.log('--- relationship checks (expect all 0) ---');
  for (const [label, sql] of checks) {
    const r = await db.query(sql);
    console.log(label.padEnd(36), r.rows[0].c);
  }
  await db.end();
})().catch(e => { console.error('VERIFY FAILED:', e.message); process.exit(1); });
