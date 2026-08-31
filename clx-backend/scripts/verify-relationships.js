require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const p = new Pool((() => {
  const u = process.env.DATABASE_URL || '';
  if (!u.includes('@') || (u.match(/@/g) || []).length <= 1) return { connectionString: u };
  const m = u.match(/^(\w+:\/\/)([^:]+):(.*)@(.*)$/);
  return { host: m[4].split(':')[0], port: 5432, user: m[2], password: m[3], database: 'postgres', ssl: { rejectUnauthorized: false } };
})());
const Q = {
  campuses: "select count(*) c from campuses",
  categories: "select count(*) c from categories",
  vendors_demo: "select count(*) c from vendors where slug like 'demo-%'",
  vendors_total: "select count(*) c from vendors",
  products_demo: "select count(*) c from products p join vendors v on v.id=p.vendor_id where v.slug like 'demo-%'",
  services_demo: "select count(*) c from services s join vendors v on v.id=s.vendor_id where v.slug like 'demo-%'",
  marketplace_demo: "select count(*) c from marketplace_listings where slug like 'demo-listing-%'",
  delivery_zones: "select count(*) c from delivery_zones",
  profiles: "select count(*) c from profiles",
  roles: "select count(*) c from user_roles",
  orphan_products: "select count(*) c from products p left join vendors v on v.id=p.vendor_id where v.id is null",
  orphan_prodcat: "select count(*) c from products p left join categories c on c.id=p.category_id where p.category_id is not null and c.id is null",
  orphan_services: "select count(*) c from services s left join vendors v on v.id=s.vendor_id where v.id is null",
  orphan_listings: "select count(*) c from marketplace_listings l left join profiles pr on pr.id=l.seller_id where pr.id is null",
  vendor_no_campus: "select count(*) c from vendors v left join vendor_campuses vc on vc.vendor_id=v.id where vc.vendor_id is null",
  vendor_no_hours: "select count(*) c from vendors v where v.slug like 'demo-%' and not exists (select 1 from vendor_operating_hours h where h.vendor_id=v.id)"
};
(async () => {
  const out = {};
  for (const [k, sql] of Object.entries(Q)) out[k] = (await p.query(sql)).rows[0].c;
  console.log(JSON.stringify(out, null, 1));
  await p.end();
})().catch(e => { console.error(e.message); process.exit(1); });
