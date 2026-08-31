require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
(async () => {
  const u = new URL(process.env.DATABASE_URL);
  const db = new Client({ user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), host: u.hostname, port: +(u.port || 5432), database: u.pathname.replace('/', ''), ssl: { rejectUnauthorized: false } });
  await db.connect();
  const out = {};
  for (const t of ['campuses', 'categories', 'vendors', 'products', 'services', 'marketplace_listings', 'delivery_zones', 'profiles', 'user_roles', 'vendor_applications'])
    out[t] = +(await db.query(`select count(*) c from ${t}`)).rows[0].c;
  console.log('COUNTS', JSON.stringify(out));
  const or = {};
  const checks = {
    vendors_bad_campus: `select count(*) c from vendor_campuses vc left join campuses c on c.id=vc.campus_id left join vendors v on v.id=vc.vendor_id where c.id is null or v.id is null`,
    products_bad_vendor: `select count(*) c from products p left join vendors v on v.id=p.vendor_id where v.id is null`,
    products_bad_cat: `select count(*) c from products p left join categories c on c.id=p.category_id where c.id is null`,
    services_bad_vendor: `select count(*) c from services s left join vendors v on v.id=s.vendor_id where v.id is null`,
    listings_bad_seller: `select count(*) c from marketplace_listings l left join profiles p on p.id=l.seller_user_id where p.id is null`,
    listings_bad_campus: `select count(*) c from marketplace_listings l left join campuses c on c.id=l.campus_id where c.id is null`,
    listings_bad_cat: `select count(*) c from marketplace_listings l left join categories c on c.id=l.category_id where c.id is null`,
    hours_bad_vendor: `select count(*) c from vendor_operating_hours h left join vendors v on v.id=h.vendor_id where v.id is null`,
  };
  for (const [k, sql] of Object.entries(checks)) or[k] = +(await db.query(sql)).rows[0].c;
  console.log('ORPHANS', JSON.stringify(or));
  const dup = {};
  dup.vendor_slugs = +(await db.query(`select count(*) c from (select slug from vendors group by slug having count(*)>1) x`)).rows[0].c;
  dup.product_legacy = +(await db.query(`select count(*) c from (select legacy_key from products where legacy_key like 'demo:%' group by legacy_key having count(*)>1) x`)).rows[0].c;
  dup.listing_legacy = +(await db.query(`select count(*) c from (select legacy_key from marketplace_listings where legacy_key like 'demo:%' group by legacy_key having count(*)>1) x`)).rows[0].c;
  console.log('DUPES', JSON.stringify(dup));
  const roles = (await db.query(`select role, count(*) c from user_roles group by role order by role`)).rows;
  console.log('ROLES', JSON.stringify(roles));
  await db.end();
})().catch(e => { console.error(e.message); process.exit(1); });
